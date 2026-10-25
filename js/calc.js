// 小計算器介面
(() => {
  const $ = id => document.getElementById(id);
  const num = (id, def = 0) => { const v = parseFloat($(id).value); return isFinite(v) ? v : def; };
  function fmt(v, d = 4) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-3) return v.toExponential(3);
    return parseFloat(v.toPrecision(d)).toString();
  }
  function setupCanvas(c) {
    const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    return { ctx, w: r.width, h: r.height };
  }
  function text(ctx, s, x, y, opt = {}) { ctx.save(); ctx.font = opt.font || '12px system-ui, sans-serif'; ctx.fillStyle = opt.color || '#111827'; ctx.textAlign = opt.align || 'center'; ctx.textBaseline = opt.base || 'middle'; ctx.fillText(s, x, y); ctx.restore(); }
  function arrow(ctx, x1, y1, x2, y2, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L < 1) { ctx.restore(); return; }
    const ux = dx / L, uy = dy / L;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * 5, y2 - uy * 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * 8 - uy * 4, y2 - uy * 8 + ux * 4); ctx.lineTo(x2 - ux * 8 + uy * 4, y2 - uy * 8 - ux * 4); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // 導覽
  document.querySelectorAll('.calc-nav button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.calc-nav button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.calc').forEach(c => c.classList.toggle('active', c.id === 'calc-' + b.dataset.calc));
    renderAll();
  }));

  // ================= 斷面 =================
  const SEC_PARAMS = {
    rect: [['b', '寬 b', 30], ['h', '高 h', 60]],
    hollowRect: [['b', '外寬 B', 40], ['h', '外高 H', 60], ['bi', '內寬 b', 30], ['hi', '內高 h', 50]],
    I: [['bf', '翼板寬 b_f', 20], ['tf', '翼板厚 t_f', 1.5], ['h', '總高 h', 40], ['tw', '腹板厚 t_w', 1]],
    T: [['bf', '翼板寬 b_f', 40], ['tf', '翼板厚 t_f', 10], ['h', '總高 h', 50], ['tw', '腹板厚 t_w', 15]],
    circle: [['d', '直徑 d', 40]],
    pipe: [['d', '外徑 D', 40], ['di', '內徑 d', 34]],
  };
  let customParts = [{ b: 40, h: 10, y: 50 }, { b: 10, h: 50, y: 0 }];
  function renderSecParams() {
    const shape = $('sec-shape').value, box = $('sec-params');
    if (shape === 'custom') {
      box.innerHTML = `<table class="tbl small seg-table"><tr><th>#</th><th>寬 b（負 = 挖空）</th><th>高 h</th><th>底邊 y</th><th></th></tr>${customParts.map((p, i) => `<tr><td>${i + 1}</td><td><input type="number" step="any" value="${p.b}" data-k="b" data-i="${i}"></td><td><input type="number" step="any" value="${p.h}" data-k="h" data-i="${i}"></td><td><input type="number" step="any" value="${p.y}" data-k="y" data-i="${i}"></td><td><button class="btn small" data-del="${i}">刪</button></td></tr>`).join('')}</table><button class="btn small" id="sec-add">＋矩形</button>`;
      box.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { customParts[+inp.dataset.i][inp.dataset.k] = parseFloat(inp.value) || 0; renderSection(); }));
      box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { customParts.splice(+b.dataset.del, 1); renderSecParams(); renderSection(); }));
      $('sec-add').addEventListener('click', () => { customParts.push({ b: 10, h: 10, y: 0 }); renderSecParams(); renderSection(); });
    } else {
      box.innerHTML = SEC_PARAMS[shape].map(([k, label, def]) => `<label class="field"><span>${label}</span><input type="number" step="any" id="sp-${k}" value="${def}"></label>`).join('');
      box.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderSection));
    }
  }
  function secParams() {
    const shape = $('sec-shape').value;
    if (shape === 'custom') return { parts: customParts.filter(p => p.h > 0 && p.b !== 0) };
    const p = {}; for (const [k] of SEC_PARAMS[shape]) p[k] = num('sp-' + k); return p;
  }
  function renderSection() {
    const shape = $('sec-shape').value, p = secParams();
    let sec;
    try { sec = CalcCore.section(shape, p); } catch (e) { sec = null; }
    const steps = $('sec-steps');
    if (!sec || !isFinite(sec.I) || sec.A <= 0) { steps.innerHTML = '<div>請輸入有效尺寸（面積需為正）</div>'; return; }
    const M = num('sec-M'), V = num('sec-V');
    const st = CalcCore.stresses(sec, M, V);
    let html = '';
    if (sec.composite) {
      html += `<div><b>形心（自基準線）</b> ȳ = ΣA·y / ΣA = ${fmt(sec.rows.reduce((a, r) => a + r.Ay, 0))} / ${fmt(sec.A)} = <b>${fmt(sec.ybar)}</b></div>`;
      html += `<table class="tbl small"><tr><th>#</th><th>A</th><th>y</th><th>A·y</th><th>I₀ = bh³/12</th><th>d = y − ȳ</th><th>A·d²</th></tr>${sec.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${fmt(r.A)}</td><td>${fmt(r.yc)}</td><td>${fmt(r.Ay)}</td><td>${fmt(r.I0)}</td><td>${fmt(r.d)}</td><td>${fmt(r.Ad2)}</td></tr>`).join('')}</table>`;
      html += `<div>I = Σ(I₀ + A·d²) = <b>${fmt(sec.I)}</b></div>`;
    }
    html += `<div class="big">A = ${fmt(sec.A)}　I = ${fmt(sec.I)}　r = √(I/A) = ${fmt(sec.r)}</div>`;
    html += `<div>S_top = I / y_top = ${fmt(sec.I)} / ${fmt(sec.ytop)} = <b>${fmt(sec.Stop)}</b>；S_bot = I / y_bot = ${fmt(sec.I)} / ${fmt(sec.ybot)} = <b>${fmt(sec.Sbot)}</b></div>`;
    if (sec.formula) html += `<div class="muted">${sec.formula.join('；')}</div>`;
    if (M) html += `<div><b>彎曲應力</b> σ = M/S：頂 σ_top = ${fmt(st.sTop)}（${st.sTop < 0 ? '壓' : '拉'}），底 σ_bot = ${fmt(st.sBot)}（${st.sBot < 0 ? '壓' : '拉'}）；|σ|max = <b>${fmt(Math.max(Math.abs(st.sTop), Math.abs(st.sBot)))}</b></div>`;
    if (V) html += `<div><b>剪應力</b> τmax = VQ/(Ib) = ${fmt(V)}×${fmt(sec.Q)} / (${fmt(sec.I)}×${fmt(sec.bNA)}) = <b>${fmt(st.tau)}</b>（平均 V/A = ${fmt(st.tauAvg)}，比值 ${fmt(st.tau / st.tauAvg, 3)}）</div>`;
    html += `<div class="muted">效率指標：I/A = ${fmt(sec.I / sec.A)}（= r²）；S/A = ${fmt(Math.min(sec.Stop, sec.Sbot) / sec.A)}</div>`;
    steps.innerHTML = html;
    drawSection(sec, shape, p, st, M, V);
  }
  function drawSection(sec, shape, p, st, M, V) {
    const { ctx, w, h } = setupCanvas($('sec-canvas'));
    const H = sec.h, W = shape === 'circle' || shape === 'pipe' ? sec.h : Math.max(...(sec.rows ? sec.rows.map(r => Math.abs(r.b)) : [1]));
    const scale = Math.min((h - 60) / H, (w * 0.4) / W);
    const cx = w * 0.3, baseY = h / 2 + H * scale / 2;
    ctx.save(); ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
    if (shape === 'circle' || shape === 'pipe') {
      ctx.beginPath(); ctx.arc(cx, baseY - H * scale / 2, H * scale / 2, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (shape === 'pipe') { ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(cx, baseY - H * scale / 2, p.di * scale / 2, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    } else {
      for (const r of sec.rows) {
        const bw = Math.abs(r.b) * scale, bh = r.h * scale;
        ctx.fillStyle = r.b < 0 ? '#fafafa' : '#cbd5e1';
        ctx.fillRect(cx - bw / 2, baseY - (r.y + r.h) * scale, bw, bh);
        ctx.strokeRect(cx - bw / 2, baseY - (r.y + r.h) * scale, bw, bh);
      }
    }
    // 中性軸
    const yNA = baseY - sec.ybar * scale;
    ctx.strokeStyle = '#dc2626'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(cx - W * scale / 2 - 20, yNA); ctx.lineTo(cx + W * scale / 2 + 20, yNA); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, `中性軸 ȳ = ${fmt(sec.ybar)}`, cx, yNA - 10, { color: '#dc2626', font: '11px system-ui' });
    ctx.restore();
    // 應力分布
    const sx = w * 0.62, sw = w * 0.14;
    const top = baseY - H * scale, bot = baseY;
    if (M) {
      const smax = Math.max(Math.abs(st.sTop), Math.abs(st.sBot)) || 1;
      const xt = sx + st.sTop / smax * sw, xb = sx + st.sBot / smax * sw;
      ctx.save(); ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(xt, top); ctx.lineTo(xb, bot); ctx.lineTo(sx, bot); ctx.closePath();
      ctx.fillStyle = 'rgba(37,99,235,0.2)'; ctx.fill(); ctx.strokeStyle = '#2563eb'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, top - 10); ctx.lineTo(sx, bot + 10); ctx.strokeStyle = '#6b7280'; ctx.stroke(); ctx.restore();
      text(ctx, `σ_top = ${fmt(st.sTop)}`, xt, top - 10, { color: '#2563eb', font: '11px system-ui' });
      text(ctx, `σ_bot = ${fmt(st.sBot)}`, xb, bot + 12, { color: '#2563eb', font: '11px system-ui' });
      text(ctx, '彎曲應力 σ = My/I', sx, bot + 28, { color: '#374151', font: '11px system-ui' });
    }
    if (V) {
      const tx = w * 0.86, tw = w * 0.1;
      // 剪應力：中性軸處最大，矩形為拋物線；其他形狀以示意
      ctx.save(); ctx.beginPath(); ctx.moveTo(tx, top);
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const yy = top + (bot - top) * i / n;
        const eta = (yNA - yy) / ((bot - top) / 2); // −1..1 近似
        const val = Math.max(0, 1 - eta * eta);
        ctx.lineTo(tx + val * tw, yy);
      }
      ctx.lineTo(tx, bot); ctx.closePath(); ctx.fillStyle = 'rgba(220,38,38,0.18)'; ctx.fill(); ctx.strokeStyle = '#dc2626'; ctx.stroke(); ctx.restore();
      text(ctx, `τmax = ${fmt(st.tau)}`, tx + tw + 4, yNA, { color: '#dc2626', font: '11px system-ui', align: 'left' });
      text(ctx, '剪應力 τ = VQ/Ib', tx + tw / 2, bot + 28, { color: '#374151', font: '11px system-ui' });
    }
  }
  $('sec-shape').addEventListener('change', () => { renderSecParams(); renderSection(); });
  ['sec-M', 'sec-V'].forEach(id => $(id).addEventListener('input', renderSection));
  renderSecParams();

  // ================= 分段軸力 =================
  let axData = { segs: [{ L: 100, A: 10, E: 20000 }, { L: 100, A: 20, E: 20000 }, { L: 100, A: 10, E: 20000 }], P: [30, -50, 20] };
  function renderAxTable() {
    const n = parseInt($('ax-n').value);
    while (axData.segs.length < n) { axData.segs.push({ L: 100, A: 10, E: 20000 }); axData.P.push(0); }
    axData.segs.length = n; axData.P.length = n;
    const right = $('ax-right').checked;
    $('ax-table').innerHTML = `<tr><th>段</th><th>L</th><th>A</th><th>E</th><th>右端節點 P（→ 正）</th></tr>` + axData.segs.map((s, i) => `<tr><td>${i + 1}</td><td><input type="number" step="any" value="${s.L}" data-i="${i}" data-k="L"></td><td><input type="number" step="any" value="${s.A}" data-i="${i}" data-k="A"></td><td><input type="number" step="any" value="${s.E}" data-i="${i}" data-k="E"></td><td>${right && i === n - 1 ? `<span class="muted">固定端（反力 R）</span><input type="hidden" value="${axData.P[i]}" data-i="${i}" data-k="P">` : `<input type="number" step="any" value="${axData.P[i]}" data-i="${i}" data-k="P">`}</td></tr>`).join('');
    $('ax-table').querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { const i = +inp.dataset.i, k = inp.dataset.k; if (k === 'P') axData.P[i] = parseFloat(inp.value) || 0; else axData.segs[i][k] = parseFloat(inp.value) || 0; renderAxial(); }));
  }
  function renderAxial() {
    const right = $('ax-right').checked;
    const P = axData.P.slice(); if (right) P[P.length - 1] = 0;
    const r = CalcCore.axialBar(axData.segs, P, right);
    const n = axData.segs.length;
    let html = '';
    html += `<div><b>各段軸力（由右往左累加，拉力為正）</b></div>`;
    r.Nfree.forEach((N, i) => { html += `<div>段 ${i + 1}：N = Σ右側載重 = ${P.slice(i).map(v => fmt(v)).join(' + ')}${right ? ' + R' : ''} = ${fmt(N)}${right ? ' + R' : ''}</div>`; });
    if (right) {
      html += `<div><b>相容條件</b>（兩端固定，總伸長 = 0）：Σ N_i L_i/(E_i A_i) = 0</div>`;
      html += `<div>Σ (N⁰_i·f_i) + R·Σf_i = 0，f_i = L_i/(E_iA_i) = [${r.flex.map(f => fmt(f)).join(', ')}]</div>`;
      html += `<div class="big">R（右端反力，→ 正）= ${fmt(r.R)}；左端反力 R_L = ${fmt(r.RL)}</div>`;
      r.N.forEach((N, i) => { html += `<div>段 ${i + 1}：N = ${fmt(N)}（${N > 0 ? '拉' : N < 0 ? '壓' : '零'}）</div>`; });
    } else {
      html += `<div class="big">左端反力 R_L = −N₁ = ${fmt(r.RL)}</div>`;
    }
    html += `<div><b>伸長量</b> δ_i = N_i L_i/(E_i A_i)：${r.delta.map((d, i) => `δ${i + 1} = ${fmt(d)}`).join('；')}</div>`;
    html += `<div class="big">節點位移 u：${r.u.map((u, i) => `u${i} = ${fmt(u)}`).join('，')}${right ? '' : `；右端總位移 δ = ${fmt(r.total)}`}</div>`;
    $('ax-steps').innerHTML = html;
    // 繪圖
    const { ctx, w, h } = setupCanvas($('ax-canvas'));
    const Ltot = axData.segs.reduce((a, s) => a + s.L, 0) || 1;
    const x0 = 50, x1 = w - 50, sc = (x1 - x0) / Ltot;
    const Amax = Math.max(...axData.segs.map(s => s.A)) || 1;
    let x = x0; const yBar = 60;
    ctx.save();
    // 支承
    ctx.fillStyle = '#374151'; ctx.fillRect(x0 - 8, yBar - 30, 8, 60);
    if (right) ctx.fillRect(x1, yBar - 30, 8, 60);
    axData.segs.forEach((s, i) => {
      const bw = s.L * sc, bh = 10 + 20 * s.A / Amax;
      ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = '#334155'; ctx.fillRect(x, yBar - bh / 2, bw, bh); ctx.strokeRect(x, yBar - bh / 2, bw, bh);
      text(ctx, `A=${fmt(s.A)} E=${fmt(s.E)}`, x + bw / 2, yBar - bh / 2 - 8, { font: '10px system-ui', color: '#374151' });
      text(ctx, `L=${fmt(s.L)}`, x + bw / 2, yBar + bh / 2 + 10, { font: '10px system-ui', color: '#6b7280' });
      x += bw;
      const Pi = P[i];
      if (Pi && !(right && i === n - 1)) { const dir = Pi > 0 ? 1 : -1; arrow(ctx, x - dir * 5, yBar, x + dir * 40, yBar, '#c2410c'); text(ctx, `P=${fmt(Math.abs(Pi))}`, x + dir * 45, yBar - 12, { color: '#c2410c', font: '11px system-ui' }); }
    });
    // 軸力圖
    const yN = h * 0.62, Nmax = Math.max(...r.N.map(Math.abs)) || 1, k = 50 / Nmax;
    ctx.strokeStyle = '#6b7280'; ctx.beginPath(); ctx.moveTo(x0, yN); ctx.lineTo(x1, yN); ctx.stroke();
    x = x0;
    axData.segs.forEach((s, i) => {
      const bw = s.L * sc, N = r.N[i];
      ctx.fillStyle = N >= 0 ? 'rgba(29,78,216,0.25)' : 'rgba(220,38,38,0.25)'; ctx.strokeStyle = N >= 0 ? '#1d4ed8' : '#dc2626';
      ctx.fillRect(x, yN - N * k, bw, N * k); ctx.strokeRect(x, yN - N * k, bw, N * k);
      text(ctx, `${fmt(N)} ${N > 0 ? 'T' : N < 0 ? 'C' : ''}`, x + bw / 2, yN - N * k + (N >= 0 ? -10 : 12), { color: N >= 0 ? '#1d4ed8' : '#dc2626', font: 'bold 11px system-ui' });
      x += bw;
    });
    text(ctx, '軸力圖 N', x0 - 30, yN, { font: '11px system-ui', color: '#374151' });
    text(ctx, `δ 總 = ${fmt(r.total)}`, w / 2, h - 12, { font: '11px system-ui', color: '#7c3aed' });
    ctx.restore();
  }
  $('ax-n').addEventListener('change', () => { renderAxTable(); renderAxial(); });
  $('ax-right').addEventListener('change', () => { renderAxTable(); renderAxial(); });
  renderAxTable();

  // ================= 柱側向勁度與週期 =================
  let stCols = [{ E: 2e7, I: 0.002, h: 4, fixity: 'fixed' }, { E: 2e7, I: 0.002, h: 2, fixity: 'fixed' }];
  function renderStTable() {
    const n = parseInt($('st-n').value);
    while (stCols.length < n) stCols.push({ E: 2e7, I: 0.002, h: 4, fixity: 'fixed' });
    stCols.length = n;
    $('st-table').innerHTML = `<tr><th>柱</th><th>E</th><th>I</th><th>h</th><th>端部</th></tr>` + stCols.map((c, i) => `<tr><td>${i + 1}</td><td><input type="number" step="any" value="${c.E}" data-i="${i}" data-k="E"></td><td><input type="number" step="any" value="${c.I}" data-i="${i}" data-k="I"></td><td><input type="number" step="any" value="${c.h}" data-i="${i}" data-k="h"></td><td><select data-i="${i}" data-k="fixity"><option value="fixed" ${c.fixity === 'fixed' ? 'selected' : ''}>兩端固定 12EI/h³</option><option value="pinned" ${c.fixity === 'pinned' ? 'selected' : ''}>一端鉸 3EI/h³</option></select></td></tr>`).join('');
    $('st-table').querySelectorAll('input,select').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { const i = +el.dataset.i, k = el.dataset.k; stCols[i][k] = k === 'fixity' ? el.value : (parseFloat(el.value) || 0); renderStiff(); }));
  }
  function renderStiff() {
    const V = num('st-V'); let m = num('st-m'); const W = num('st-W');
    if (W > 0) m = W / 9.81;
    const r = CalcCore.storyStiffness(stCols, V, m);
    let html = '';
    r.items.forEach((c, i) => { html += `<div>柱 ${i + 1}：k = ${c.coef}EI/h³ = ${c.coef}×${fmt(c.E)}×${fmt(c.I)}/${fmt(c.h)}³ = <b>${fmt(c.k)}</b>（佔 ${fmt(c.share * 100, 3)}%）→ V_${i + 1} = ${fmt(c.V)}，柱端 M = ${fmt(c.M)}</div>`; });
    html += `<div class="big">K = Σk = ${fmt(r.K)}；層間位移 Δ = V/K = ${fmt(r.drift)}</div>`;
    if (m > 0) html += `<div class="big">T = 2π√(m/K) = 2π√(${fmt(m)}/${fmt(r.K)}) = ${fmt(r.T)} s；f = ${fmt(r.f)} Hz</div>`;
    html += `<div class="muted">若 m 加為 4 倍 → T 加倍；若 K 加為 4 倍 → T 減半。</div>`;
    const H = num('st-H');
    if (H > 0) { const e = CalcCore.empiricalPeriod(H); html += `<div><b>經驗公式</b> T = C·H^0.75（H = ${fmt(H)} m）：RC 構架 0.070 → ${fmt(e.rc, 3)} s；鋼構架 0.085 → ${fmt(e.steel, 3)} s；其他 0.050 → ${fmt(e.other, 3)} s（約每層 0.1 s）</div>`; }
    $('st-steps').innerHTML = html;
    // 繪圖：柱列與剪力分配
    const { ctx, w, h } = setupCanvas($('st-canvas'));
    const n = r.items.length, hmax = Math.max(...stCols.map(c => c.h)) || 1;
    const gap = (w - 80) / Math.max(n, 1), sc = (h - 110) / hmax;
    const yBase = h - 50;
    ctx.save();
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, yBase); ctx.lineTo(w - 30, yBase); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(40, yBase - hmax * sc); ctx.lineTo(w - 40, yBase - hmax * sc); ctx.stroke();
    r.items.forEach((c, i) => {
      const x = 40 + gap * (i + 0.5), top = yBase - hmax * sc;
      const colTop = top, colBot = yBase - (hmax - c.h) * sc;
      ctx.lineWidth = 4 + 10 * c.share; ctx.strokeStyle = c.share > 0.5 ? '#dc2626' : '#2563eb';
      ctx.beginPath(); ctx.moveTo(x, colTop); ctx.lineTo(x, colBot); ctx.stroke();
      if (c.h < hmax - 1e-9) { ctx.fillStyle = '#9ca3af'; ctx.fillRect(x - 25, colBot, 50, yBase - colBot); text(ctx, '牆/短柱', x, (colBot + yBase) / 2, { font: '10px system-ui', color: '#fff' }); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, c.fixity === 'pinned' ? colBot : colTop, 0, 0, 0); ctx.fill();
      if (c.fixity === 'pinned') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, colBot, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
      text(ctx, `k=${fmt(c.k, 3)}`, x, colTop - 24, { font: '11px system-ui', color: '#374151' });
      text(ctx, `V=${fmt(c.V, 3)} (${fmt(c.share * 100, 3)}%)`, x, colTop - 12, { font: 'bold 11px system-ui', color: c.share > 0.5 ? '#dc2626' : '#2563eb' });
      text(ctx, `h=${fmt(c.h)}`, x + 22, (colTop + colBot) / 2, { font: '10px system-ui', color: '#6b7280', align: 'left' });
    });
    arrow(ctx, 40, yBase - hmax * sc - 36, 110, yBase - hmax * sc - 36, '#c2410c');
    text(ctx, `V = ${fmt(V)}`, 75, yBase - hmax * sc - 48, { color: '#c2410c', font: '11px system-ui' });
    text(ctx, `Δ = ${fmt(r.drift, 3)}`, w - 60, yBase - hmax * sc - 36, { color: '#7c3aed', font: '11px system-ui' });
    ctx.restore();
  }
  $('st-n').addEventListener('change', () => { renderStTable(); renderStiff(); });
  ['st-V', 'st-m', 'st-W', 'st-H'].forEach(id => $(id).addEventListener('input', renderStiff));
  renderStTable();

  // ================= 柱挫屈 =================
  $('bk-end').innerHTML = CalcCore.END_CONDITIONS.map(e => `<option value="${e.key}">${e.label}（K = ${e.K}）</option>`).join('');
  function renderBuck() {
    const E = num('bk-E'), I = num('bk-I'), A = num('bk-A'), L = num('bk-L'), sy = num('bk-sy');
    if (!(E > 0 && I > 0 && A > 0 && L > 0)) { $('bk-steps').innerHTML = '<div>請輸入正值</div>'; return; }
    const r = CalcCore.buckling(E, I, A, L, sy);
    const sel = $('bk-end').value;
    const cur = r.rows.find(x => x.key === sel);
    let html = `<div class="big">${cur.label}：K = ${cur.K}，有效長度 KL = ${fmt(cur.Le)}</div>`;
    html += `<div>Pcr = π²EI/(KL)² = π²×${fmt(E)}×${fmt(I)} / ${fmt(cur.Le)}² = <b>${fmt(cur.Pcr)}</b></div>`;
    html += `<div>r = √(I/A) = ${fmt(r.r)}；長細比 λ = KL/r = ${fmt(cur.lambda)}；σcr = Pcr/A = π²E/λ² = ${fmt(cur.scr)}</div>`;
    if (sy > 0) html += `<div>${cur.elastic ? `σcr ≤ σy（${fmt(sy)}）→ 彈性挫屈，尤拉公式適用` : `σcr > σy（${fmt(sy)}）→ 先降伏／非彈性挫屈，尤拉公式不適用（上限 P = σy·A = ${fmt(sy * A)}）`}；λ 界限 = π√(E/σy) = ${fmt(r.lambdaLimit)}</div>`;
    html += `<table class="tbl small"><tr><th>端部條件</th><th>K</th><th>KL</th><th>Pcr</th><th>比例</th><th>λ</th><th>σcr</th></tr>${r.rows.map(x => `<tr ${x.key === sel ? 'style="background:#dbeafe"' : ''}><td>${x.label}</td><td>${x.K}</td><td>${fmt(x.Le)}</td><td>${fmt(x.Pcr)}</td><td>${fmt(x.Pcr / r.rows[0].Pcr, 3)}</td><td>${fmt(x.lambda)}</td><td>${fmt(x.scr)}</td></tr>`).join('')}</table>`;
    html += `<div class="muted">比例以兩端鉸接為 1：兩端固定 4 倍、固定–鉸 ≈ 2 倍、懸臂 1/4。L 減半 → Pcr 4 倍；I 加倍 → Pcr 加倍。</div>`;
    $('bk-steps').innerHTML = html;
    // 繪圖：五種端部條件的挫屈形狀
    const { ctx, w, h } = setupCanvas($('bk-canvas'));
    const n = r.rows.length, gap = w / n, top = 40, bot = h - 40, Hc = bot - top;
    r.rows.forEach((x, i) => {
      const cx = gap * (i + 0.5), amp = 14;
      ctx.save();
      ctx.strokeStyle = x.key === sel ? '#2563eb' : '#9ca3af'; ctx.lineWidth = x.key === sel ? 2.5 : 1.5;
      ctx.beginPath();
      for (let s = 0; s <= 60; s++) {
        const t = s / 60, y = bot - Hc * t;
        let dx;
        switch (x.key) {
          case 'pp': dx = Math.sin(Math.PI * t); break;
          case 'ff': dx = (1 - Math.cos(2 * Math.PI * t)) / 2; break;
          case 'fp': dx = Math.sin(1.4303 * Math.PI * t) - 1.4303 * Math.PI * t * Math.cos(1.4303 * Math.PI); dx /= 1.9; break;
          case 'fg': dx = (1 - Math.cos(Math.PI * t)) / 2; break;
          case 'ffree': dx = 1 - Math.cos(Math.PI * t / 2); break;
        }
        const px = cx + dx * amp;
        if (s === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#d1d5db'; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bot); ctx.stroke(); ctx.setLineDash([]);
      // 端部符號
      ctx.fillStyle = '#374151';
      const drawPin = y => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); };
      const drawFix = y => { ctx.fillStyle = '#374151'; ctx.fillRect(cx - 14, y - 2, 28, 4); };
      const drawGuide = y => { ctx.fillStyle = '#374151'; ctx.fillRect(cx - 14 + amp, y - 2, 28, 4); ctx.fillRect(cx - 14 + amp, y - 8, 28, 2); };
      if (x.key === 'pp') { drawPin(bot); drawPin(top); }
      if (x.key === 'ff') { drawFix(bot); drawFix(top); }
      if (x.key === 'fp') { drawFix(bot); drawPin(top); }
      if (x.key === 'fg') { drawFix(bot); drawGuide(top); }
      if (x.key === 'ffree') { drawFix(bot); }
      // 有效長度標示（反曲點間距）
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2;
      const Le = Math.min(x.K, 1) * Hc; // 畫面上以 KL 長度示意（懸臂 2L 超出柱高，另註明）
      const yA = x.key === 'ff' ? bot - Hc * 0.25 : x.key === 'fp' ? bot - Hc * 0.3 : bot, yB = yA - Le;
      ctx.beginPath(); ctx.moveTo(cx - 22, yA); ctx.lineTo(cx - 22, Math.max(top, yB)); ctx.stroke();
      ctx.restore();
      text(ctx, `K=${x.K}`, cx, top - 22, { font: 'bold 12px system-ui', color: x.key === sel ? '#2563eb' : '#374151' });
      text(ctx, x.label.length > 8 ? x.label.slice(0, 8) : x.label, cx, top - 9, { font: '10px system-ui', color: '#6b7280' });
      text(ctx, `Pcr 比 ${fmt(x.Pcr / r.rows[0].Pcr, 3)}`, cx, bot + 14, { font: '11px system-ui', color: '#374151' });
      text(ctx, x.key === 'ffree' ? 'KL = 2L' : `KL = ${x.K}L`, cx, bot + 27, { font: '10px system-ui', color: '#dc2626' });
    });
  }
  ['bk-E', 'bk-I', 'bk-A', 'bk-L', 'bk-sy'].forEach(id => $(id).addEventListener('input', renderBuck));
  $('bk-end').addEventListener('change', renderBuck);

  function renderAll() { renderSection(); renderAxial(); renderStiff(); renderBuck(); }
  window.addEventListener('resize', renderAll);
  renderAll();
})();
