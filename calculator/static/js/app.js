// ===== CONSTANTS =====
const SCHEME_COLORS = ['#667eea', '#e94560', '#38a169', '#ed8936', '#805ad5', '#319795'];

let schemeCount = 0;

// Default SV data (中Y薪火2年 625k USD policy)
const DEFAULT_SV_DATA = [
  { year: 1,  guaranteed: 1007500, dividend: 0,    terminal: 0 },
  { year: 2,  guaranteed: 1007500, dividend: 0,    terminal: 0 },
  { year: 3,  guaranteed: 1091188, dividend: 125,  terminal: 0 },
  { year: 5,  guaranteed: 1091188, dividend: 394,  terminal: 137500 },
  { year: 6,  guaranteed: 1091188, dividend: 531,  terminal: 206875 },
  { year: 7,  guaranteed: 1225000, dividend: 681,  terminal: 276488 },
  { year: 8,  guaranteed: 1225000, dividend: 825,  terminal: 325000 },
  { year: 9,  guaranteed: 1225000, dividend: 969,  terminal: 387500 },
  { year: 10, guaranteed: 1278050, dividend: 1163, terminal: 535900 },
  { year: 15, guaranteed: 1325000, dividend: 2313, terminal: 1075000 },
  { year: 20, guaranteed: 1381800, dividend: 4038, terminal: 1791650 },
  { year: 25, guaranteed: 1437500, dividend: 5938, terminal: 2718750 },
  { year: 30, guaranteed: 1506800, dividend: 9163, terminal: 3892563 },
];

// ===== READ GLOBAL PARAMS =====
function getGlobalParams() {
  const gp = id => parseFloat(document.getElementById('gp_' + id).value) || 0;
  return {
    first_premium_usd:              gp('first_premium_usd'),
    pay_years:                      Math.max(1, Math.round(gp('pay_years') || 2)),
    first_year_discount_pct:        gp('first_year_discount_pct'),
    extra_discount_pct:             gp('extra_discount_pct'),
    day1_sv_ratio_pct:              gp('day1_sv_ratio_pct'),
    ltv_ratio_pct:                  gp('ltv_ratio_pct'),
    handling_fee_pct:               gp('handling_fee_pct'),
    prime_rate_pct:                 gp('prime_rate_pct'),
    interest_spread_pct:            gp('interest_spread_pct'),
    interest_decline_bps:           gp('interest_decline_bps'),
    interest_floor_pct:             gp('interest_floor_pct'),
    terminal_bonus_realization_pct: gp('terminal_bonus_realization_pct'),
    usd_to_hkd:                     gp('usd_to_hkd'),
    usd_to_rmb:                     gp('usd_to_rmb'),
  };
}

// ===== LIVE COMPUTED SUMMARY =====
function updateComputedSummary() {
  const p = getGlobalParams();
  const payYears = p.pay_years;
  // Year 1 after discount; years 2..N discounted at 6% PV
  let netPremium = p.first_premium_usd * (1 - p.first_year_discount_pct/100 - p.extra_discount_pct/100);
  for (let i = 1; i < payYears; i++) netPremium += p.first_premium_usd / Math.pow(1.06, i);
  const totalPremium = p.first_premium_usd * payYears;
  const day1SV   = totalPremium * (p.day1_sv_ratio_pct / 100);
  const loan     = day1SV * (p.ltv_ratio_pct / 100);
  const fee      = loan * (p.handling_fee_pct / 100);
  const outlay   = netPremium - loan + fee;
  const ratio    = netPremium > 0 ? outlay / netPremium : 0;
  const leverage = ratio > 0 ? 1 / ratio : 0;
  const rate     = p.prime_rate_pct + p.interest_spread_pct;

  const fmt = n => 'USD ' + Math.round(n).toLocaleString('en-US');
  document.getElementById('gc_total_premium').textContent = fmt(totalPremium);
  document.getElementById('gc_net_premium').textContent = fmt(netPremium);
  document.getElementById('gc_day1_sv').textContent     = fmt(day1SV);
  document.getElementById('gc_loan').textContent        = fmt(loan);
  document.getElementById('gc_outlay').textContent      = fmt(outlay);
  document.getElementById('gc_ratio').textContent       = (ratio * 100).toFixed(2) + '%';
  document.getElementById('gc_leverage').textContent    = leverage.toFixed(2) + 'x';
  document.getElementById('gc_rate').textContent        = rate.toFixed(2) + '%';
}

document.querySelectorAll('.gp-group input').forEach(el => {
  el.addEventListener('input', updateComputedSummary);
});

// ===== SCHEME MANAGEMENT =====
function addScheme(svData, name) {
  schemeCount++;
  const color = SCHEME_COLORS[(schemeCount - 1) % SCHEME_COLORS.length];
  const id = 'scheme-' + schemeCount;

  const card = document.createElement('div');
  card.className = 'scheme-card';
  card.dataset.schemeId = id;
  card.innerHTML = `
    <div class="scheme-header" style="background: linear-gradient(90deg, ${color} 0%, ${shadeColor(color, -25)} 100%)">
      <div class="scheme-title-row">
        <span class="scheme-badge">方案 ${schemeCount}</span>
        <input type="text" class="scheme-name-input" placeholder="方案名稱" value="${escHtml(name || '方案 ' + schemeCount)}">
      </div>
      <div class="scheme-header-actions">
        <button onclick="removeScheme(this)" title="刪除方案">✕</button>
      </div>
    </div>
    <div class="scheme-body">
      <div class="sv-section-title">
        按年保證收益 / 退保價值
        <button class="btn-outline btn-sm add-year-btn" style="margin-top:0" onclick="addYearRow(this)">＋ 新增年份</button>
      </div>
      <div class="sv-table-wrapper">
        <table class="sv-input-table">
          <thead>
            <tr>
              <th>保單年份</th>
              <th>保證現金值 (USD)</th>
              <th>累計紅利+利息 (USD)</th>
              <th>終期紅利 (USD)</th>
              <th>合計退保值 (USD)</th>
              <th></th>
            </tr>
          </thead>
          <tbody class="sv-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  const tbody = card.querySelector('.sv-tbody');
  const rows = svData || DEFAULT_SV_DATA;
  rows.forEach(row => addYearRowToTbody(tbody, row));

  document.getElementById('schemesList').appendChild(card);
}

function removeScheme(btn) {
  btn.closest('.scheme-card').remove();
  renumberSchemes();
}

function renumberSchemes() {
  document.querySelectorAll('.scheme-card').forEach((card, i) => {
    const color = SCHEME_COLORS[i % SCHEME_COLORS.length];
    card.querySelector('.scheme-badge').textContent = '方案 ' + (i + 1);
    card.querySelector('.scheme-header').style.background =
      `linear-gradient(90deg, ${color} 0%, ${shadeColor(color, -25)} 100%)`;
  });
}

// ===== YEAR ROW MANAGEMENT =====
function addYearRow(btn) {
  const tbody = btn.closest('.scheme-body').querySelector('.sv-tbody');
  addYearRowToTbody(tbody, null);
}

function addYearRowToTbody(tbody, data) {
  const template = document.getElementById('yearRowTemplate');
  const clone = template.content.cloneNode(true);
  const row = clone.querySelector('.sv-row');
  if (data) {
    row.querySelector('.year-input').value = data.year || '';
    row.querySelector('[data-sv="guaranteed"]').value = data.guaranteed || '';
    row.querySelector('[data-sv="dividend"]').value   = data.dividend   || '';
    row.querySelector('[data-sv="terminal"]').value   = data.terminal   || '';
    updateSVTotalForRow(row);
  }
  tbody.appendChild(clone);
}

function removeYearRow(btn) {
  btn.closest('tr').remove();
}

function updateSVTotal(input) {
  updateSVTotalForRow(input.closest('tr'));
}

function updateSVTotalForRow(row) {
  const g = parseFloat(row.querySelector('[data-sv="guaranteed"]').value) || 0;
  const d = parseFloat(row.querySelector('[data-sv="dividend"]').value)   || 0;
  const t = parseFloat(row.querySelector('[data-sv="terminal"]').value)   || 0;
  const total = g + d + t;
  row.querySelector('.sv-total-input').value = total > 0 ? Math.round(total).toLocaleString('en-US') : '';
}

// ===== DATA COLLECTION =====
function collectAllParams() {
  const global = getGlobalParams();
  const schemes = [];
  document.querySelectorAll('.scheme-card').forEach(card => {
    const name = card.querySelector('.scheme-name-input').value.trim() || '未命名';
    const years_data = [];
    card.querySelectorAll('.sv-row').forEach(row => {
      const year = parseInt(row.querySelector('.year-input').value);
      if (!year || year < 1) return;
      years_data.push({
        year,
        guaranteed_usd: parseFloat(row.querySelector('[data-sv="guaranteed"]').value) || 0,
        dividend_usd:   parseFloat(row.querySelector('[data-sv="dividend"]').value)   || 0,
        terminal_usd:   parseFloat(row.querySelector('[data-sv="terminal"]').value)   || 0,
      });
    });
    schemes.push({ ...global, scheme_name: name, years_data: years_data.sort((a,b) => a.year - b.year) });
  });
  return schemes;
}

// ===== CALCULATION =====
async function calculateAll() {
  const cards = document.querySelectorAll('.scheme-card');
  if (!cards.length) { alert('請先新增至少一個方案'); return; }

  const schemes = collectAllParams();
  showLoading(true);
  try {
    const resp = await fetch('/api/calculate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ schemes }),
    });
    const results = await resp.json();
    renderResults(results);
  } catch (e) {
    showError('計算出錯: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== RENDER RESULTS =====
function renderResults(results) {
  const area    = document.getElementById('resultsArea');
  const content = document.getElementById('resultsContent');
  content.innerHTML = '';
  area.style.display = 'block';

  const successful = results.filter(r => r.success);
  if (!successful.length) {
    content.innerHTML = '<div class="error-box">所有方案計算失敗，請檢查輸入數據</div>';
    return;
  }

  // 1. Summary cards
  const grid = document.createElement('div');
  grid.className = 'summary-grid';
  successful.forEach((r, i) => grid.appendChild(renderSummaryCard(r.data, i)));
  content.appendChild(grid);

  // 2. Detail tables per scheme
  successful.forEach((r, i) => content.appendChild(renderDetailTable(r.data, i)));

  // 3. Comparison (multi-scheme)
  if (successful.length > 1) content.appendChild(renderComparisonTable(successful.map(r => r.data)));

  // Scroll to results
  area.scrollIntoView({ behavior: 'smooth' });
}

function renderSummaryCard(data, idx) {
  const color = SCHEME_COLORS[idx % SCHEME_COLORS.length];
  const card = document.createElement('div');
  card.className = 'summary-card';
  card.style.borderTopColor = color;

  const fmtUSD = n => 'USD ' + formatNumber(n);
  const fmtHKD = n => 'HKD ' + formatNumber(n);
  const pct    = n => (n !== null && n !== undefined) ? n.toFixed(2) + '%' : 'N/A';

  card.innerHTML = `
    <div class="summary-card-title" style="color:${color}">
      <span class="scheme-color-dot" style="background:${color}"></span>
      ${escHtml(data.scheme_name)}
    </div>
    <div class="summary-row"><span class="summary-label">每期保費</span><span class="summary-value">${fmtUSD(data.first_premium_usd)}</span></div>
    <div class="summary-row"><span class="summary-label">供款期</span><span class="summary-value">${data.pay_years} 年</span></div>
    <div class="summary-row"><span class="summary-label">總保費</span><span class="summary-value">${fmtUSD(data.total_premium_usd)}</span></div>
    <div class="summary-row"><span class="summary-label">淨保費（折扣後）</span><span class="summary-value">${fmtUSD(data.net_premium_usd)}</span></div>
    <div class="summary-row"><span class="summary-label">首日退保價值</span><span class="summary-value">${fmtUSD(data.day1_sv_usd)}</span></div>
    <div class="summary-row"><span class="summary-label">銀行貸款額</span><span class="summary-value highlight">${fmtUSD(data.loan_amount_usd)}</span></div>
    <div class="summary-row"><span class="summary-label">貸款額 (HKD)</span><span class="summary-value">${fmtHKD(data.loan_amount_hkd)}</span></div>
    <div class="summary-row"><span class="summary-label">客戶自付額</span><span class="summary-value highlight">${fmtUSD(data.client_outlay_usd)}</span></div>
    <div class="summary-row"><span class="summary-label">自付額 (HKD)</span><span class="summary-value">${fmtHKD(data.client_outlay_hkd)}</span></div>
    <div class="summary-row"><span class="summary-label">自付比例</span><span class="summary-value">${pct(data.self_pay_ratio_pct)}</span></div>
    <div class="summary-row"><span class="summary-label">槓桿倍數</span><span class="summary-value highlight">${data.leverage}x</span></div>
    <div class="summary-row"><span class="summary-label">首年利率</span><span class="summary-value">${pct(data.initial_interest_rate_pct)}</span></div>
    <div class="summary-row"><span class="summary-label">利率下限</span><span class="summary-value">${pct(data.floor_interest_rate_pct)}</span></div>
  `;
  return card;
}

function renderDetailTable(data, idx) {
  const color = SCHEME_COLORS[idx % SCHEME_COLORS.length];
  const section = document.createElement('div');
  section.className = 'results-table-section';

  // Find first breakeven year
  let breakevenYear = null;
  for (const r of data.results) {
    if (r.leveraged_irr_pct !== null && r.leveraged_irr_pct > 0) { breakevenYear = r.year; break; }
  }

  const rows = data.results.map(r => {
    const isBreakeven = r.year === breakevenYear;
    const rowCls = isBreakeven ? ' class="breakeven"' : '';
    const fmtIRR = v => {
      if (v === null || v === undefined) return '<td>—</td>';
      return `<td class="${v >= 0 ? 'positive' : 'negative'}">${v.toFixed(2)}%</td>`;
    };
    const fmtPct = v => {
      if (v === null || v === undefined) return '<td>—</td>';
      return `<td class="${v >= 0 ? 'positive' : 'negative'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</td>`;
    };
    const fmtN = v => `<td>${formatNumber(v)}</td>`;
    const fmtNS = v => `<td class="${v >= 0 ? 'positive' : 'negative'}">${v >= 0 ? '+' : ''}${formatNumber(v)}</td>`;
    return `<tr${rowCls}>
      <td class="year-col">第 ${r.year} 年</td>
      ${fmtN(r.guaranteed_usd)}
      ${fmtN(r.dividend_usd)}
      ${fmtN(r.terminal_usd)}
      <td style="font-weight:700;color:#2b6cb0">${formatNumber(r.total_sv_usd)}</td>
      ${fmtIRR(r.basic_irr_pct)}
      ${fmtPct(r.gross_return_pct)}
      <td>${r.interest_rate_pct.toFixed(2)}%</td>
      ${fmtN(r.cumulative_interest_usd)}
      ${fmtNS(r.net_gain_usd)}
      ${fmtIRR(r.leveraged_irr_pct)}
      ${fmtPct(r.net_return_pct)}
    </tr>`;
  }).join('');

  section.innerHTML = `
    <div class="results-table-title">
      <span class="scheme-color-dot" style="background:${color}"></span>
      ${escHtml(data.scheme_name)}
      ${breakevenYear ? `<span style="font-size:0.82rem;color:#718096;font-weight:500">（融資方案第 ${breakevenYear} 年轉正）</span>` : ''}
    </div>
    <div class="results-table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th rowspan="2">年份</th>
            <th colspan="4" class="group-header" style="background:${color}">退保價值 (USD)</th>
            <th colspan="2" class="group-header" style="background:#4a5568">基本計劃</th>
            <th colspan="5" class="group-header" style="background:#2d3748">融資計劃</th>
          </tr>
          <tr>
            <th>保證現金值</th><th>累計紅利</th><th>終期紅利</th><th>合計退保值</th>
            <th>基本IRR</th><th>總回報%</th>
            <th>年利率</th><th>累計利息</th><th>融資淨收益</th><th>融資IRR</th><th>融資淨回報%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return section;
}

function renderComparisonTable(schemes) {
  const section = document.createElement('div');
  section.className = 'comparison-section';

  const keyYears = [5, 7, 10, 15, 20, 30];
  const getY = (s, y) => s.results.find(r => r.year === y);

  const schemeHeaders = schemes.map((s, i) => {
    const color = SCHEME_COLORS[i % SCHEME_COLORS.length];
    return `<th style="background:${color}">${escHtml(s.scheme_name)}</th>`;
  }).join('');

  const highlightRow = (vals, invert = false) => {
    const valid = vals.filter(v => v !== null && v !== undefined);
    if (valid.length < 2) return vals.map(() => '');
    const best  = invert ? Math.min(...valid) : Math.max(...valid);
    const worst = invert ? Math.max(...valid) : Math.min(...valid);
    return vals.map(v => {
      if (v === null || v === undefined) return '';
      if (v === best)  return 'best';
      if (v === worst) return 'worst';
      return '';
    });
  };

  const buildRow = (label, fn, fmt, invert = false) => {
    const vals = schemes.map(fn);
    const cls  = highlightRow(vals, invert);
    const cells = vals.map((v, i) => `<td class="${cls[i]}">${v !== null && v !== undefined ? fmt(v) : '—'}</td>`).join('');
    return `<tr><td class="metric-label">${label}</td>${cells}</tr>`;
  };

  const fmtUSD = v => 'USD ' + formatNumber(v);
  const fmtPct = v => v.toFixed(2) + '%';
  const fmtX   = v => v.toFixed(2) + 'x';

  let rows = '';
  rows += `<tr class="section-row"><td colspan="${schemes.length+1}">基本架構</td></tr>`;
  rows += buildRow('銀行貸款額', s => s.loan_amount_usd, fmtUSD);
  rows += buildRow('客戶自付額', s => s.client_outlay_usd, fmtUSD, true);
  rows += buildRow('自付比例',   s => s.self_pay_ratio_pct, fmtPct, true);
  rows += buildRow('槓桿倍數',   s => s.leverage, fmtX);
  rows += buildRow('首年利率',   s => s.initial_interest_rate_pct, fmtPct, true);

  keyYears.forEach(y => {
    if (!schemes.some(s => getY(s, y))) return;
    rows += `<tr class="section-row"><td colspan="${schemes.length+1}">第 ${y} 年</td></tr>`;
    rows += buildRow('退保總值',   s => getY(s,y)?.total_sv_usd ?? null, fmtUSD);
    rows += buildRow('基本計劃IRR',s => getY(s,y)?.basic_irr_pct ?? null, fmtPct);
    rows += buildRow('融資淨收益', s => getY(s,y)?.net_gain_usd ?? null, fmtUSD);
    rows += buildRow('融資IRR',    s => getY(s,y)?.leveraged_irr_pct ?? null, fmtPct);
    rows += buildRow('融資淨回報%',s => getY(s,y)?.net_return_pct ?? null, fmtPct);
  });

  section.innerHTML = `
    <div class="results-table-title">📊 多方案對比</div>
    <div class="results-table-wrapper">
      <table class="comparison-table">
        <thead><tr><th>指標</th>${schemeHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:0.8rem;color:#a0aec0;margin-top:10px;text-align:right">
      🟢 綠色 = 最優 &nbsp;|&nbsp; 🔴 紅色 = 最差（同行對比）
    </p>
  `;
  return section;
}

// ===== UTILITIES =====
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.abs(n) >= 1000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n.toFixed(2);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function shadeColor(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amt));
  return '#' + ((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
}
function showLoading(show) {
  let el = document.getElementById('loadingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.className = 'loading-overlay';
    el.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">計算中…</div>';
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}
function showError(msg) {
  const area = document.getElementById('resultsArea');
  const content = document.getElementById('resultsContent');
  area.style.display = 'block';
  content.innerHTML = `<div class="error-box">⚠️ ${escHtml(msg)}</div>`;
}

// ===== TOGGLE GLOBAL PARAMS =====
function toggleGlobalParams() {
  const inner = document.getElementById('gpInner');
  const btn   = document.getElementById('gpToggleBtn');
  const collapsed = inner.classList.toggle('collapsed');
  btn.textContent = collapsed ? '展開 ▼' : '收起 ▲';
}

// ===== INIT =====
function init() {
  // 2 default schemes with same SV (user will change scheme 2)
  addScheme(DEFAULT_SV_DATA, '中Y薪火2年 集友銀行 P-1.7%');
  addScheme(
    DEFAULT_SV_DATA.map(r => ({ ...r })),
    '方案 2（請修改退保數據）'
  );
  updateComputedSummary();

  // Live update on global param changes
  document.querySelectorAll('.gp-group input').forEach(el => {
    el.addEventListener('input', updateComputedSummary);
  });
}

document.addEventListener('DOMContentLoaded', init);
