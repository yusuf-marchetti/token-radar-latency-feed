// Latency Feed's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the board from it. No network: every byte it shows is in
// data.js. The farm plans it shows are the board's own, carried in each row.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) { document.getElementById('board').textContent = 'No radar data.'; return; }
  var M = DATA.model;
  var rows = DATA.rows.slice();
  var live = DATA.live.slice();
  var selected = null;
  var sandbox = null; // {base, vel, over} while the sandbox is on, else null
  var sortKey = 'rank';
  var sortDir = 1;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n, digits) { return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The same formula main.ts runs, from the snapshot's own figures.
  function sandboxImplied(r, sb) {
    var v = clamp(r.change_7d === null ? 0 : r.change_7d, -50, 150);
    var age = r.age_days === null ? 300 : r.age_days;
    var vel = 1 + (v / 100) * sb.vel;
    var over = 1 + (Math.min(Math.max(age, 0), 900) / 900) * sb.over;
    var breadth = 1 + 0.04 * Math.min(r.chains.length, 5);
    return Math.max(1, Math.round(r.tvl_usd * sb.base * vel * over * breadth));
  }

  // ---- header + stats ------------------------------------------------------
  $('modelVer').textContent = DATA.model_version;
  $('modelVer2').textContent = DATA.model_version;
  $('snapDate').textContent = DATA.as_of;
  $('snapSrc').textContent = DATA.source.replace(/^DefiLlama /, '');
  var top = rows[0];
  $('stats').innerHTML =
    stat(money(top ? top.implied_value_usd : 0), 'top implied value') +
    stat(String(DATA.watchlist_size), 'watchlist protocols') +
    stat(String(DATA.board_size), 'board rows') +
    stat(String(DATA.early_size), 'early finds below floor') +
    stat(String(DATA.hot_size), 'hot signals', 'hot') +
    stat(money(DATA.floor_usd), 'watchlist floor');
  function stat(v, label, cls) {
    return '<div class="stat' + (cls ? ' ' + cls : '') + '"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>';
  }

  // ---- filter controls -----------------------------------------------------
  var chains = [], cats = [];
  rows.forEach(function (r) {
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
  });
  chains.sort(); cats.sort();
  chains.forEach(function (c) { $('chain').appendChild(opt(c, c)); });
  cats.forEach(function (c) { $('cat').appendChild(opt(c, c)); });
  function opt(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; return o; }

  var params = new URLSearchParams(location.search);
  if (params.get('q')) $('q').value = params.get('q');
  if (params.get('chain')) $('chain').value = params.get('chain');
  if (params.get('cat')) $('cat').value = params.get('cat');
  if (params.get('lat')) $('lat').value = params.get('lat');
  if (params.get('minTvl')) $('minTvl').value = params.get('minTvl');
  if (params.get('sort')) $('sort').value = params.get('sort');

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var ch = $('chain').value, ca = $('cat').value, la = $('lat').value;
    var min = parseInt($('minTvl').value, 10) || 0;
    var out = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (ca && r.category !== ca) return false;
      if (la && r.latency !== la) return false;
      if (r.tvl_usd < min) return false;
      return true;
    });
    var key = $('sort').value;
    var cmp = {
      rank: function (a, b) { return (sbRank(a) - sbRank(b)) || (a.slug < b.slug ? -1 : 1); },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      vel: function (a, b) { return (b.velocity_per_day || -99) - (a.velocity_per_day || -99); },
      age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
      name: function (a, b) { return a.name.localeCompare(b.name); }
    }[key] || null;
    if (cmp) out.sort(cmp);
    return out;
  }
  function sbRank(r) { return sandbox ? r._sbRank : r.rank; }
  function sbImplied(r) { return sandbox ? r._sbImplied : r.implied_value_usd; }

  function render() {
    if (sandbox) {
      var scored = rows.map(function (r) { return { r: r, v: sandboxImplied(r, sandbox) }; });
      scored.sort(function (a, b) { return b.v - a.v || (a.r.slug < b.r.slug ? -1 : 1); });
      scored.forEach(function (s, i) { s.r._sbRank = i + 1; s.r._sbImplied = s.v; });
    }
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols' +
      (sandbox ? ' · sandbox ranking (submitted ranks in the detail view)' : ' · ranked by implied value');
    var html = '';
    list.forEach(function (r) {
      var ch7 = r.change_7d === null ? '—' : pct(r.change_7d);
      var vel = r.velocity_per_day === null ? '—' : pct(r.velocity_per_day, 2) + '/day';
      var cls = r.change_7d === null ? '' : (r.change_7d > 0 ? 'pos' : (r.change_7d < 0 ? 'neg' : ''));
      var age = r.age_days === null ? 'unknown' : r.age_days + 'd';
      html += '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + sbRank(r) + '</td>' +
        '<td><b>' + esc(r.name) + '</b><span class="slug">' + esc(r.slug) + '</span><span class="cat">' + esc(r.category || 'Uncategorized') + '</span></td>' +
        '<td><span class="badge ' + r.latency + '">' + r.latency.toUpperCase() + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num"><span class="' + cls + '">' + ch7 + '</span><br><span class="mono">' + vel + '</span></td>' +
        '<td class="num">' + age + '</td>' +
        '<td class="num"><b>' + money(sbImplied(r)) + '</b></td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td></tr>';
    });
    $('rows').innerHTML = html || '<tr><td colspan="8">No protocols match these filters.</td></tr>';
    document.querySelectorAll('#rows tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  // ---- detail view ---------------------------------------------------------
  function showDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    selected = slug;
    var d = $('detail');
    var age = r.age_days === null ? 'unknown' : r.age_days + ' days';
    var velBar = clamp((r.velocity_multiplier - 0.65) / 1.4, 0, 1) * 100;
    var overBar = clamp((r.overdue_multiplier - 1) / 0.6, 0, 1) * 100;
    var breadthBar = clamp((r.breadth_multiplier - 1) / 0.2, 0, 1) * 100;
    var steps = r.farm_steps.map(function (s, i) { return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>'; }).join('');
    d.innerHTML =
      '<h2>#' + sbRank(r) + ' ' + esc(r.name) + ' <span class="badge ' + r.latency + '">' + r.latency.toUpperCase() + '</span></h2>' +
      '<p class="meta-line">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      ' · first listed ' + esc(r.listed_at || 'unknown') + ' · records no token (no market cap, CoinGecko id or symbol)' +
      (sandbox ? ' · submitted rank #' + r.rank : '') + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><b>' + money(sbImplied(r)) + '</b><span>implied value</span></div>' +
      '<div class="cell"><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="cell"><b>' + (r.change_7d === null ? '—' : pct(r.change_7d)) + '</b><span>7-day change</span></div>' +
      '<div class="cell"><b>' + age + '</b><span>signal age</span></div></div>' +
      '<div class="bars">' +
      bar('Velocity ×' + r.velocity_multiplier.toFixed(2), velBar) +
      bar('Overdue ×' + r.overdue_multiplier.toFixed(2), overBar) +
      bar('Breadth ×' + r.breadth_multiplier.toFixed(2), breadthBar) +
      '</div>' +
      '<p class="fine">Base = TVL × ' + M.base_multiple + '. Velocity uses the 7-day change clamped to ' +
      M.velocity_floor + '…+' + M.velocity_cap + '%. Overdue grows over ' + M.overdue_days +
      ' days of running with no token. Breadth adds ' + (M.breadth_per_chain * 100) + '% per chain, up to ' +
      M.breadth_max_chains + ' chains.</p>' +
      '<h2>Farm plan — move ' + (r.latency === 'hot' ? 'within 6 hours' : r.latency === 'warm' ? 'within 48 hours' : 'within 2 weeks') + '</h2>' +
      '<ol>' + steps + '</ol>';
    d.hidden = false;
    render();
    d.scrollIntoView({ behavior: 'auto', block: 'start' });
    function bar(label, w) {
      return '<div class="bar-row"><span>' + esc(label) + '</span><div class="bar"><i style="width:' + w.toFixed(0) + '%"></i></div><span class="mono">' + w.toFixed(0) + '%</span></div>';
    }
  }

  // ---- live-token view -----------------------------------------------------
  function renderLive() {
    $('liveRows').innerHTML = live.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</td>' +
        '<td class="num">' + (p.change_7d === null ? '—' : pct(p.change_7d)) + '</td>' +
        '<td>' + esc(p.chains.slice(0, 3).join(', ')) + '</td></tr>';
    }).join('');
  }
  renderLive();
  $('liveBtn').addEventListener('click', function () {
    var l = $('live');
    l.hidden = !l.hidden;
    $('liveBtn').textContent = l.hidden ? 'Show live-token protocols' : 'Hide live-token protocols';
    if (!l.hidden) l.scrollIntoView({ behavior: 'auto' });
  });

  // ---- sorting + filters ---------------------------------------------------
  document.querySelectorAll('#tbl thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var map = { rank: 'rank', name: 'name', tvl: 'tvl', vel: 'vel', age: 'age', imp: 'rank', lat: 'vel' };
      var k = map[th.getAttribute('data-k')] || 'rank';
      if ($('sort').value === k) { rows.reverse(); render(); return; }
      $('sort').value = k; render();
    });
  });
  ['q', 'chain', 'cat', 'lat', 'minTvl', 'sort'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  $('resetBtn').addEventListener('click', function () {
    ['q', 'chain', 'cat', 'lat', 'minTvl'].forEach(function (id) { $(id).value = id === 'minTvl' ? '0' : ''; });
    $('sort').value = 'rank'; selected = null; $('detail').hidden = true; render();
  });

  // ---- model sandbox -------------------------------------------------------
  function readSandbox() {
    sandbox = {
      base: parseFloat($('sbBase').value),
      vel: parseFloat($('sbVel').value),
      over: parseFloat($('sbOver').value)
    };
    $('sbBaseOut').textContent = sandbox.base.toFixed(2);
    $('sbVelOut').textContent = sandbox.vel.toFixed(2);
    $('sbOverOut').textContent = sandbox.over.toFixed(2);
    var def = sandbox.base === M.base_multiple && sandbox.vel === M.velocity_weight && sandbox.over === M.overdue_range;
    if (def) sandbox = null;
    $('sbNote').textContent = sandbox
      ? 'Sandbox on — base ' + sandbox.base.toFixed(2) + ', velocity weight ' + sandbox.vel.toFixed(2) + ', overdue range ' + sandbox.over.toFixed(2) + '. The submitted board uses the house constants.'
      : 'Sandbox off — board shows the submitted ranking.';
    render();
  }
  ['sbBase', 'sbVel', 'sbOver'].forEach(function (id) { $(id).addEventListener('input', readSandbox); });
  $('sbReset').addEventListener('click', function () {
    $('sbBase').value = String(M.base_multiple);
    $('sbVel').value = String(M.velocity_weight);
    $('sbOver').value = String(M.overdue_range);
    readSandbox();
  });

  render();
  if (params.get('detail')) showDetail(params.get('detail'));
  if (params.get('view') === 'live') $('liveBtn').click();
})();
