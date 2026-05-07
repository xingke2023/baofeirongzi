from flask import Flask, render_template, request, jsonify
import numpy as np
import json

app = Flask(__name__)


def calculate_irr(cash_flows):
    """Calculate IRR using numpy/scipy-like Newton's method."""
    if len(cash_flows) < 2:
        return None
    # Check if there's a sign change
    signs = [1 if c >= 0 else -1 for c in cash_flows]
    if all(s == signs[0] for s in signs):
        return None
    try:
        # Newton-Raphson method
        rate = 0.1
        for _ in range(1000):
            npv = sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows))
            d_npv = sum(-t * cf / (1 + rate) ** (t + 1) for t, cf in enumerate(cash_flows))
            if abs(d_npv) < 1e-12:
                break
            new_rate = rate - npv / d_npv
            if abs(new_rate - rate) < 1e-8:
                rate = new_rate
                break
            rate = new_rate
            if rate <= -1:
                rate = -0.999
        if -1 < rate < 10:
            return round(rate * 100, 2)
    except Exception:
        pass
    return None


def build_interest_schedule(prime_rate, spread_pct, years, decline_bps=25, floor_pct=None):
    """Build declining interest rate schedule.

    spread_pct: e.g. -1.7 means P-1.7%
    decline_bps: basis points decline per year (default 25bps)
    floor_pct: minimum rate floor (if None, defaults to initial_rate - 5*decline)
    """
    initial_rate = (prime_rate + spread_pct) / 100
    schedule = []
    rate = initial_rate
    floor = (floor_pct / 100) if floor_pct is not None else (initial_rate - 5 * decline_bps / 10000)
    for y in range(1, years + 1):
        schedule.append(max(rate, floor))
        rate -= decline_bps / 10000
    return schedule


def calculate_scheme(params):
    """
    Calculate all metrics for a single premium financing scheme.

    params keys:
    - scheme_name: str
    - first_premium_usd: float  (e.g. 625000)
    - first_year_discount_pct: float  (e.g. 7.0)
    - extra_discount_pct: float  (e.g. 0)
    - ltv_ratio_pct: float  (e.g. 95.0)
    - handling_fee_pct: float  (e.g. 1.0)
    - prime_rate_pct: float  (e.g. 5.25)
    - interest_spread_pct: float  (e.g. -1.7, negative = below prime)
    - interest_decline_bps: int  (e.g. 25, bps per year)
    - interest_floor_pct: float  (e.g. 2.3)
    - terminal_bonus_realization_pct: float  (e.g. 100)
    - day1_sv_ratio_pct: float  (e.g. 77.77, first day SV as % of total 2yr premium)
    - years_data: list of dicts, each:
        { year, guaranteed_factor, dividend_factor, terminal_factor }
      OR precomputed:
        { year, guaranteed_usd, dividend_usd, terminal_usd }
    """
    P = params['first_premium_usd']
    pay_years = max(1, int(params.get('pay_years', 2)))
    disc = params.get('first_year_discount_pct', 0) / 100
    extra_disc = params.get('extra_discount_pct', 0) / 100
    ltv = params.get('ltv_ratio_pct', 95) / 100
    fee_rate = params.get('handling_fee_pct', 1) / 100
    prime = params.get('prime_rate_pct', 5.25)
    spread = params.get('interest_spread_pct', -1.7)
    decline_bps = params.get('interest_decline_bps', 25)
    floor_pct = params.get('interest_floor_pct', 2.3)
    tb_rate = params.get('terminal_bonus_realization_pct', 100) / 100
    day1_ratio = params.get('day1_sv_ratio_pct', 77.77) / 100
    usd_to_hkd = params.get('usd_to_hkd', 7.8)
    usd_to_rmb = params.get('usd_to_rmb', 7.28)

    # Core calculations
    # Year 1 pays with discount; subsequent years discounted at 6% PV per year
    net_premium = P * (1 - disc - extra_disc) + sum(P / (1.06 ** i) for i in range(1, pay_years))
    total_premium = P * pay_years
    day1_sv = total_premium * day1_ratio
    loan_amount = day1_sv * ltv
    handling_fee = loan_amount * fee_rate
    client_outlay = net_premium - loan_amount + handling_fee
    self_pay_ratio = client_outlay / net_premium if net_premium else 0
    leverage = 1 / self_pay_ratio if self_pay_ratio else 0

    # Max years from data
    years_data = params.get('years_data', [])
    max_year = max(d['year'] for d in years_data) if years_data else 30

    # Interest rate schedule
    interest_schedule = build_interest_schedule(prime, spread, max_year, decline_bps, floor_pct)

    # Process each year
    results = []
    cumulative_interest = 0

    for entry in sorted(years_data, key=lambda x: x['year']):
        y = entry['year']

        # Surrender value components
        if 'guaranteed_usd' in entry:
            guaranteed = entry['guaranteed_usd']
            dividends = entry.get('dividend_usd', 0)
            terminal = entry.get('terminal_usd', 0) * tb_rate
        else:
            # Factor-based (factor × first_premium)
            guaranteed = P * entry.get('guaranteed_factor', 0)
            dividends = P * entry.get('dividend_factor', 0)
            terminal = P * entry.get('terminal_factor', 0) * tb_rate

        total_sv = guaranteed + dividends + terminal

        # Interest for this year
        rate = interest_schedule[y - 1] if y <= len(interest_schedule) else interest_schedule[-1]
        annual_interest = loan_amount * rate
        cumulative_interest += annual_interest

        # Basic plan (no leverage) metrics
        gross_return_pct = (total_sv / net_premium - 1) * 100 if net_premium else 0
        avg_annual_return = gross_return_pct / y if y else 0

        # Build basic IRR cash flows: [-net_premium, 0, ..., 0, total_sv]
        basic_cf = [-net_premium] + [0] * (y - 1) + [total_sv]
        # Adjust: for 2-year pay, year 0 is net_premium (already computed as PV)
        basic_irr = calculate_irr(basic_cf)

        # Leveraged plan metrics
        net_gain = total_sv - loan_amount - cumulative_interest
        net_profit = net_gain - client_outlay  # profit after recouping own capital
        net_return_pct = net_gain / client_outlay * 100 if client_outlay else 0
        avg_annual_net_return = net_return_pct / y if y else 0

        # Build leveraged IRR cash flows
        # Year 0: -client_outlay
        # Years 1 to y-1: -annual interest (using schedule)
        # Year y: total_sv - loan_amount
        lev_cf = [-client_outlay]
        cum_int_temp = 0
        for yr in range(1, y):
            r = interest_schedule[yr - 1] if yr <= len(interest_schedule) else interest_schedule[-1]
            lev_cf.append(-(loan_amount * r))
        lev_cf.append(total_sv - loan_amount)
        leveraged_irr = calculate_irr(lev_cf)

        results.append({
            'year': y,
            'guaranteed_usd': round(guaranteed),
            'dividend_usd': round(dividends),
            'terminal_usd': round(terminal),
            'total_sv_usd': round(total_sv),
            'interest_rate_pct': round(rate * 100, 2),
            'annual_interest_usd': round(annual_interest),
            'cumulative_interest_usd': round(cumulative_interest),
            'gross_return_pct': round(gross_return_pct, 2),
            'avg_annual_return_pct': round(avg_annual_return, 2),
            'basic_irr_pct': basic_irr,
            'net_gain_usd': round(net_gain),
            'net_profit_usd': round(net_profit),
            'net_return_pct': round(net_return_pct, 2),
            'avg_annual_net_return_pct': round(avg_annual_net_return, 2),
            'leveraged_irr_pct': leveraged_irr,
            # HKD / RMB equivalents
            'total_sv_hkd': round(total_sv * usd_to_hkd),
            'net_gain_hkd': round(net_gain * usd_to_hkd),
        })

    summary = {
        'scheme_name': params.get('scheme_name', '方案'),
        'pay_years': pay_years,
        'first_premium_usd': round(P),
        'total_premium_usd': round(total_premium),
        'first_premium_hkd': round(P * usd_to_hkd),
        'first_premium_rmb': round(P * usd_to_rmb),
        'net_premium_usd': round(net_premium),
        'day1_sv_usd': round(day1_sv),
        'day1_sv_ratio_pct': round(day1_sv / net_premium * 100, 2) if net_premium else 0,
        'loan_amount_usd': round(loan_amount),
        'loan_amount_hkd': round(loan_amount * usd_to_hkd),
        'loan_amount_rmb': round(loan_amount * usd_to_rmb),
        'handling_fee_usd': round(handling_fee),
        'client_outlay_usd': round(client_outlay),
        'client_outlay_hkd': round(client_outlay * usd_to_hkd),
        'client_outlay_rmb': round(client_outlay * usd_to_rmb),
        'self_pay_ratio_pct': round(self_pay_ratio * 100, 2),
        'leverage': round(leverage, 2),
        'initial_interest_rate_pct': round((prime + spread) / 100 * 100, 2),
        'floor_interest_rate_pct': floor_pct,
        'results': results,
    }
    return summary


# Default GGG 2-year Pay data (from Excel, per 100k USD base, scaled to 625k USD)
# Factors = value / 100,000 (base policy)
DEFAULT_YEARS_DATA = [
    {'year': 1,  'guaranteed_factor': 1.612,   'dividend_factor': 0,      'terminal_factor': 0},
    {'year': 2,  'guaranteed_factor': 1.612,   'dividend_factor': 0,      'terminal_factor': 0},
    {'year': 3,  'guaranteed_factor': 1.7459,  'dividend_factor': 0.0002, 'terminal_factor': 0},
    {'year': 5,  'guaranteed_factor': 1.7459,  'dividend_factor': 0.00063,'terminal_factor': 0.22},
    {'year': 6,  'guaranteed_factor': 1.7459,  'dividend_factor': 0.00085,'terminal_factor': 0.331},
    {'year': 7,  'guaranteed_factor': 1.96,    'dividend_factor': 0.00109,'terminal_factor': 0.44238},
    {'year': 8,  'guaranteed_factor': 1.96,    'dividend_factor': 0.00132,'terminal_factor': 0.52},
    {'year': 9,  'guaranteed_factor': 1.96,    'dividend_factor': 0.00155,'terminal_factor': 0.62},
    {'year': 10, 'guaranteed_factor': 2.04488, 'dividend_factor': 0.00186,'terminal_factor': 0.85744},
    {'year': 15, 'guaranteed_factor': 2.12,    'dividend_factor': 0.0037, 'terminal_factor': 1.72},
    {'year': 20, 'guaranteed_factor': 2.21088, 'dividend_factor': 0.00646,'terminal_factor': 2.86664},
    {'year': 25, 'guaranteed_factor': 2.30,    'dividend_factor': 0.0095, 'terminal_factor': 4.35},
    {'year': 30, 'guaranteed_factor': 2.41088, 'dividend_factor': 0.01466,'terminal_factor': 6.2281},
]

DEFAULT_PARAMS = {
    'scheme_name': '中Y薪火2年 集友銀行 P-1.7%',
    'first_premium_usd': 625000,
    'first_year_discount_pct': 7.0,
    'extra_discount_pct': 0,
    'ltv_ratio_pct': 95,
    'handling_fee_pct': 1.0,
    'prime_rate_pct': 5.25,
    'interest_spread_pct': -1.7,
    'interest_decline_bps': 25,
    'interest_floor_pct': 2.3,
    'terminal_bonus_realization_pct': 100,
    'day1_sv_ratio_pct': 77.77,
    'usd_to_hkd': 7.8,
    'usd_to_rmb': 7.28,
    'years_data': DEFAULT_YEARS_DATA,
}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/default_params')
def get_default_params():
    return jsonify(DEFAULT_PARAMS)


@app.route('/api/calculate', methods=['POST'])
def calculate():
    data = request.get_json()
    schemes = data.get('schemes', [])
    results = []
    for scheme_params in schemes:
        try:
            result = calculate_scheme(scheme_params)
            results.append({'success': True, 'data': result})
        except Exception as e:
            results.append({'success': False, 'error': str(e), 'scheme_name': scheme_params.get('scheme_name', '')})
    return jsonify(results)


@app.route('/api/calculate_single', methods=['POST'])
def calculate_single():
    params = request.get_json()
    try:
        result = calculate_scheme(params)
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
