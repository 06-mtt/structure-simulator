// 右側面板：屬性、結果、設定
class Panels {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    this.tab = 'props';
    this.collapsed = {};
    root.innerHTML = `
      <div class="tabs">
        <button data-tab="props" class="active">屬性</button>
        <button data-tab="results">結果</button>
        <button data-tab="library">題庫</button>
        <button data-tab="settings">設定</button>
      </div>
      <div class="tab-body"></div>`;
    this.body = root.querySelector('.tab-body');
    root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => this.setTab(b.dataset.tab)));
  }
  get model() { return this.app.model; }
  setTab(t) {
    this.tab = t;
    this.root.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    this.render();
  }
  render() {
    if (this.tab === 'props') this.renderProps();
    else if (this.tab === 'results') { if (this.app.quiz.on && !this.app.quiz.revealed) this.renderQuiz(); else this.renderResults(); }
    else if (this.tab === 'library') this.renderLibrary();
    else this.renderSettings();
  }

  // ---- 小工具 ----
  num(label, value, onChange, opts = {}) {
    const id = 'f' + Math.random().toString(36).slice(2, 8);
    const step = opts.step ?? 'any';
    return `<label class="field"><span>${label}</span><input type="number" id="${id}" value="${value}" step="${step}" ${opts.min !== undefined ? `min="${opts.min}"` : ''} data-handler="${this.reg(onChange)}"></label>`;
  }
  sel(label, value, options, onChange) {
    return `<label class="field"><span>${label}</span><select data-handler="${this.reg(onChange)}">${options.map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  }
  chk(label, value, onChange) {
    return `<label class="field check"><input type="checkbox" ${value ? 'checked' : ''} data-handler="${this.reg(onChange)}"><span>${label}</span></label>`;
  }
  btn(label, onClick, cls = '') {
    return `<button class="btn ${cls}" data-click="${this.reg(onClick)}">${label}</button>`;
  }
  reg(fn) { this.handlers = this.handlers || []; this.handlers.push(fn); return this.handlers.length - 1; }
  mount(html) {
    this.handlers = [];
    this.body.innerHTML = html;
    this.body.querySelectorAll('[data-handler]').forEach(el => {
      const fn = this.handlers[+el.dataset.handler];
      const ev = el.type === 'checkbox' ? 'change' : el.tagName === 'SELECT' ? 'change' : 'change';
      el.addEventListener(ev, () => {
        const v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
        if (el.type === 'number' && !isFinite(v)) return;
        fn(v);
        this.app.commit();
      });
      if (el.type === 'number') el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    });
    this.body.querySelectorAll('[data-click]').forEach(el => el.addEventListener('click', () => this.handlers[+el.dataset.click]()));
    this.body.querySelectorAll('[data-collapse]').forEach(el => el.addEventListener('click', () => { const k = el.dataset.collapse; this.collapsed[k] = !this.collapsed[k]; this.render(); }));
  }
  section(key, title, inner, open = true) {
    if (this.collapsed[key] === undefined) this.collapsed[key] = !open;
    const col = this.collapsed[key];
    return `<div class="section"><h3 data-collapse="${key}">${col ? '▸' : '▾'} ${title}</h3>${col ? '' : `<div class="section-body">${inner}</div>`}</div>`;
  }

  // ---- 屬性 ----
  renderProps() {
    const s = this.app.editor.selection, model = this.model;
    const F = model.settings.forceUnit, Lu = model.settings.lengthUnit;
    if (!s) {
      this.mount(`<div class="hint">
        <p><b>操作方式</b></p>
        <ul>
          <li>選「桿件」工具：點兩下畫一根桿件（按住 Shift 可連續畫）。</li>
          <li>選支承工具後點節點；點在桿件中段會自動加節點並分割桿件。</li>
          <li>載重工具點在桿件上即加載；均布載重可在桿件上拖曳指定範圍。</li>
          <li>選取工具可拖曳節點、集中力、彎矩、均布載重的位置，圖形即時更新。</li>
          <li>滾輪縮放；空白處拖曳或按住空白鍵拖曳可平移。</li>
          <li>Delete 刪除選取；Esc 取消；Ctrl+Z / Ctrl+Y 復原 / 重做。</li>
        </ul>
        <p>節點 ${model.nodes.length} 個、桿件 ${model.members.length} 根</p>
      </div>`);
      return;
    }
    if (s.type === 'node') {
      const n = Model.node(model, s.id);
      if (!n) { this.app.editor.selection = null; return this.renderProps(); }
      const sp = n.support;
      let html = `<h2>節點 ${n.id}</h2>`;
      html += this.section('n-geo', '位置', this.num(`x (${Lu})`, n.x, v => Model.moveNode(model, n, v, n.y)) + this.num(`y (${Lu})`, n.y, v => Model.moveNode(model, n, n.x, v)));
      let supInner = this.sel('支承種類', sp.type, Object.entries(Solver.SUPPORT_INFO).map(([k, v]) => [k, v.label]), v => { sp.type = v; if (v === 'spring' && !sp.kx && !sp.ky && !sp.kr) sp.ky = 1000; });
      if (sp.type !== 'none') supInner += this.num('支承面傾角 (°)', sp.angle, v => { sp.angle = v; });
      if (sp.type === 'spring') supInner += this.num(`kx (${F}/${Lu})`, sp.kx, v => { sp.kx = v; }, { min: 0 }) + this.num(`ky (${F}/${Lu})`, sp.ky, v => { sp.ky = v; }, { min: 0 }) + this.num(`kθ (${F}·${Lu}/rad)`, sp.kr, v => { sp.kr = v; }, { min: 0 });
      if (sp.type !== 'none' && sp.type !== 'spring') supInner += `<div class="sub">支承沉陷（沿支承座標）</div>` + this.num(`Δx (${Lu})`, n.settle.dx, v => { n.settle.dx = v; }) + this.num(`Δy (${Lu})`, n.settle.dy, v => { n.settle.dy = v; }) + (sp.type === 'fixed' || sp.type === 'guide' ? this.num('Δθ (rad)', n.settle.rz, v => { n.settle.rz = v; }) : '');
      html += this.section('n-sup', '支承', supInner);
      html += this.section('n-hinge', '接頭', this.chk('內鉸（此節點各桿件以鉸接相連）', n.hinge, v => { n.hinge = v; }));
      html += this.section('n-load', '節點載重', this.num(`Fx (${F}，向右正)`, n.loads.fx, v => { n.loads.fx = v; }) + this.num(`Fy (${F}，向上正)`, n.loads.fy, v => { n.loads.fy = v; }) + this.num(`M (${F}·${Lu}，逆時針正)`, n.loads.m, v => { n.loads.m = v; }));
      const ms = Model.connectedMembers(model, n.id);
      html += `<p class="muted">連接桿件：${ms.map(m => m.id).join('、') || '無'}</p>`;
      html += this.btn('刪除節點', () => { this.app.editor.selection = s; this.app.editor.deleteSelection(); }, 'danger');
      this.mount(html);
      return;
    }
    if (s.type === 'member') {
      const m = Model.member(model, s.id);
      if (!m) { this.app.editor.selection = null; return this.renderProps(); }
      const g = Model.memberGeom(model, m);
      let html = `<h2>桿件 ${m.id}</h2><p class="muted">節點 ${m.n1} → ${m.n2}，長度 ${Analysis.fmt(g.L)} ${Lu}，傾角 ${Analysis.fmt(Math.atan2(g.s, g.c) * 180 / Math.PI)}°</p>`;
      html += this.section('m-sec', '斷面與材料', this.num(`E (${F}/${Lu}²)`, m.E, v => { m.E = v; }) + this.num(`A (${Lu}²)`, m.A, v => { m.A = v; }) + this.num(`I (${Lu}⁴)`, m.I, v => { m.I = v; }) + `<p class="muted">EI = ${Analysis.fmtSci(m.E * m.I)}，EA = ${Analysis.fmtSci(m.E * m.A)}</p>`);
      html += this.section('m-rel', '桿端條件', this.chk('桁架桿（二力桿，兩端鉸接）', m.truss, v => { m.truss = v; }) + this.chk(`起端（節點 ${m.n1}）彎矩釋放`, m.release1, v => { m.release1 = v; }) + this.chk(`末端（節點 ${m.n2}）彎矩釋放`, m.release2, v => { m.release2 = v; }));
      html += this.section('m-loads', '桿件載重', this.loadsHtml(m) + `<div class="row">${this.btn('＋集中力', () => { m.loads.push(Model.newPointLoad(g.L / 2)); this.app.commit(); })}${this.btn('＋均布', () => { m.loads.push(Model.newUDL(0, g.L)); this.app.commit(); })}${this.btn('＋彎矩', () => { m.loads.push(Model.newMoment(g.L / 2)); this.app.commit(); })}${this.btn('＋溫度', () => { m.loads.push(Model.newTemp()); this.app.commit(); })}</div>`);
      html += this.btn('刪除桿件', () => { this.app.editor.selection = s; this.app.editor.deleteSelection(); }, 'danger');
      this.mount(html);
      return;
    }
    if (s.type === 'load') {
      const m = Model.member(model, s.memberId);
      const ld = m && m.loads[s.index];
      if (!ld) { this.app.editor.selection = null; return this.renderProps(); }
      let html = `<h2>載重（桿件 ${m.id}）</h2>`;
      html += this.loadFields(m, ld, s.index);
      html += this.btn('刪除此載重', () => { this.app.editor.selection = s; this.app.editor.deleteSelection(); }, 'danger');
      html += ' ' + this.btn('檢視桿件', () => this.app.editor.select({ type: 'member', id: m.id }));
      this.mount(html);
    }
  }
  loadsHtml(m) {
    if (!m.loads.length) return '<p class="muted">無</p>';
    return m.loads.map((ld, i) => `<div class="load-card">${this.loadFields(m, ld, i)}${this.btn('刪除', () => { m.loads.splice(i, 1); this.app.commit(); }, 'small danger')}</div>`).join('');
  }
  loadFields(m, ld, i) {
    const F = this.model.settings.forceUnit, Lu = this.model.settings.lengthUnit;
    const g = Model.memberGeom(this.model, m);
    const clamp = v => Math.min(Math.max(v, 0), g.L);
    if (ld.type === 'point') return `<div class="load-title">集中力</div>` + this.num(`位置 x (${Lu}，距起端)`, ld.pos, v => { ld.pos = clamp(v); }) + this.num(`大小 P (${F})`, ld.P, v => { ld.P = v; }) + this.num('方向角 (°，−90 = 向下，0 = 向右)', ld.angle, v => { ld.angle = v; });
    if (ld.type === 'udl') return `<div class="load-title">分布載重</div>` + this.num(`起點 a (${Lu})`, ld.a, v => { ld.a = clamp(v); if (ld.b < ld.a) ld.b = ld.a; }) + this.num(`終點 b (${Lu})`, ld.b, v => { ld.b = clamp(v); if (ld.a > ld.b) ld.a = ld.b; }) + this.num(`起點強度 w1 (${F}/${Lu})`, ld.w1, v => { ld.w1 = v; }) + this.num(`終點強度 w2 (${F}/${Lu})`, ld.w2, v => { ld.w2 = v; }) + this.sel('方向', ld.dir, [['global', '垂直向下（沿桿長計）'], ['projected', '垂直向下（沿水平投影計）'], ['local', '垂直於桿軸']], v => { ld.dir = v; }) + `<p class="muted">正值 = 向下（或壓向桿件）；總載重 ${Analysis.fmt((ld.w1 + ld.w2) / 2 * (ld.b - ld.a))} ${F}</p>`;
    if (ld.type === 'moment') return `<div class="load-title">集中彎矩</div>` + this.num(`位置 x (${Lu})`, ld.pos, v => { ld.pos = clamp(v); }) + this.num(`M (${F}·${Lu}，逆時針正)`, ld.M, v => { ld.M = v; });
    if (ld.type === 'temp') return `<div class="load-title">溫度變化</div>` + this.num('均勻升溫 ΔT (°C)', ld.dT, v => { ld.dT = v; }) + this.num('溫差 ΔT_d = 底 − 頂 (°C)', ld.dTd || 0, v => { ld.dTd = v; }) + this.num(`斷面深度 h (${Lu})`, ld.h || 0.5, v => { ld.h = v; }, { min: 0 }) + `<p class="muted">均勻升溫 → 伸長（軸向受束制才有軸力）；溫差 → 曲率 κ₀ = αΔT_d/h（轉動受束制才有彎矩）。靜定結構只變形、不產生內力。</p>`;
    return '';
  }

  // ---- 結果 ----
  renderResults() {
    const res = this.app.result, model = this.model;
    const F = model.settings.forceUnit, Lu = model.settings.lengthUnit;
    const fmt = Analysis.fmt;
    let html = '';
    if (this.app.quiz.on && this.app.quiz.revealed && res) html += this.quizReviewHtml();
    const cl = res && res.classification ? res.classification : Solver.classify(model);
    let detText = cl.text, detCls = cl.cls;
    if (res && res.unstable) { detText += cl.n >= 0 ? '，但實際為幾何不穩定（勁度矩陣奇異）' : ''; detCls = 'unstable'; }
    html += this.section('r-det', '穩定性與靜定度', `<div class="badge ${detCls}">${res && res.unstable ? '不穩定' : detText}</div>
      <p class="muted">m = 桿件 ${cl.m}，j = 節點 ${cl.j}，r = 反力數 ${cl.r}${cl.allTruss ? '' : `，c = 內鉸條件 ${cl.c}`}</p>
      ${cl.lines.map(l => `<div class="formula">${l}</div>`).join('')}
      ${res && res.unstable ? `<p class="warn">${res.message}。紅色虛線為機構運動形狀（動畫）。</p>
        ${res.hint && res.hint.length ? `<ul class="feat">${res.hint.map(h => `<li>${h}</li>`).join('')}</ul>` : ''}
        ${res.mechanisms && res.mechanisms.length > 1 ? `<div class="row">${res.mechanisms.map((_, i) => this.btn(`機構 ${i + 1}`, () => this.app.setMechIndex(i), 'small' + (i === (this.app.mechIndex || 0) ? ' primary' : ''))).join('')}</div>` : ''}
        ${this.chk('停止動畫（靜態顯示）', !!model.settings.noAnim, v => { model.settings.noAnim = v; })}` : ''}
      ${cl.n >= 0 && res && res.unstable ? '<p class="warn">判別式 n ≥ 0 只是必要條件，支承或桿件配置仍可能形成機構（例如反力線共點或全部平行）。</p>' : ''}`);
    if (model.meta && model.meta.kind === 'cable') html += '<div class="warn">纜索以極小 EI 的剛接桿件模擬（索多邊形為機構，無法用桁架桿直接求解），故靜定度判別對纜索不適用；內力以軸力為準。</div>';
    if (res && res.warnings && res.warnings.length) html += `<div class="warn">${res.warnings.join('<br>')}</div>`;
    // A/B 比較
    if (this.app.compareA) {
      const A = this.app.compareA;
      const cmp = Analysis.compare(A.model, A.result, model, res);
      const row = (label, va, vb, f = fmt) => `<tr><td>${label}</td><td>${va === undefined || va === null || (typeof va === 'number' && !isFinite(va)) ? '—' : f(va)}</td><td>${vb === undefined || vb === null || (typeof vb === 'number' && !isFinite(vb)) ? '—' : f(vb)}</td></tr>`;
      const sA = cmp.A || {}, sB = cmp.B || {};
      let rows = row('判別', sA.det, sB.det, v => v) + row('n', sA.n, sB.n) + row('反力數 r', sA.r, sB.r) + row('內鉸條件 c', sA.c, sB.c);
      if (sA.ok || sB.ok) rows += row('M max(+)', sA.Mmax, sB.Mmax) + row('M min(−)', sA.Mmin, sB.Mmin) + row('|V| max', sA.Vmax, sB.Vmax) + row('N max', sA.Nmax, sB.Nmax) + row('N min', sA.Nmin, sB.Nmin) + row('δ max', sA.disp, sB.disp, Analysis.fmtSci);
      const nodeIds = new Set([...Object.keys(sA.reactions || {}), ...Object.keys(sB.reactions || {})]);
      for (const id of [...nodeIds].sort((a, b) => a - b)) {
        const ra = sA.reactions && sA.reactions[id], rb = sB.reactions && sB.reactions[id];
        const txt = r => r ? `${fmt(r.fx)}, ${fmt(r.fy)}${Math.abs(r.m) > 1e-9 ? `, M=${fmt(r.m)}` : ''}` : '—';
        rows += `<tr><td>反力 節點 ${id}</td><td>${txt(ra)}</td><td>${txt(rb)}</td></tr>`;
      }
      html += this.section('r-ab', `A/B 比較（A 記錄於 ${A.time}）`, `
        ${cmp.diffs.length ? `<b>結構變更</b><ul class="feat">${cmp.diffs.map(d => `<li>${d}</li>`).join('')}</ul>` : '<p class="muted">B 與 A 相同，修改結構後即會比較。</p>'}
        <table class="tbl small"><tr><th></th><th>A</th><th>B（目前）</th></tr>${rows}</table>
        <p class="muted">圖表面板中灰色虛線為 A 的圖形。</p>`);
    }
    if (!res || !res.ok) { this.mount(html); return; }
    // 反力
    const rows = Object.entries(res.reactions).map(([id, r]) => {
      const n = Model.node(model, +id);
      const parts = [];
      if (Math.abs(n.support.angle) > 1e-9 && r.type !== 'fixed') parts.push(`R = ${fmt(Math.hypot(r.fx, r.fy))}（垂直支承面）`);
      parts.push(`Rx = ${fmt(r.fx)}`, `Ry = ${fmt(r.fy)}`);
      if (r.type === 'fixed' || r.type === 'guide' || Math.abs(r.m) > 1e-9) parts.push(`M = ${fmt(r.m)}`);
      return `<tr><td>${id}</td><td>${Solver.SUPPORT_INFO[r.type].label}</td><td>${parts.join('<br>')}</td></tr>`;
    });
    html += this.section('r-react', `支承反力（${F}、${F}·${Lu}）`, `<table class="tbl"><tr><th>節點</th><th>支承</th><th>反力（向右、向上、逆時針為正）</th></tr>${rows.join('')}</table>
      <p class="muted">ΣFx = ${fmt(this.sumLoads(res).fx)}，ΣFy = ${fmt(this.sumLoads(res).fy)}（外力 + 反力，應為 0）</p>`);
    // 關鍵值（全桁架時改由桁架內力表呈現）
    const allTruss = res.classification.allTruss;
    const mrows = allTruss ? [] : Object.entries(res.members).map(([id, mr]) => {
      const a = x => `x=${fmt(x)}`;
      return `<tr><td>${id}</td>
        <td>${fmt(mr.maxM.M)}<br><small>${a(mr.maxM.x)}</small></td>
        <td>${fmt(mr.minM.M)}<br><small>${a(mr.minM.x)}</small></td>
        <td>${fmt(mr.maxV.V)} / ${fmt(mr.minV.V)}</td>
        <td>${fmt(mr.maxN.N)} / ${fmt(mr.minN.N)}</td>
        <td>${Analysis.fmtSci(Math.abs(mr.defl.maxDefl.v))}<br><small>${a(mr.defl.maxDefl.x)}</small></td></tr>`;
    });
    if (!allTruss) html += this.section('r-key', '桿件關鍵值', `<table class="tbl small"><tr><th>桿</th><th>M max(+)</th><th>M min(−)</th><th>V max/min</th><th>N max/min</th><th>δ max</th></tr>${mrows.join('')}</table>
      <p class="muted">M 正 = 下側（局部 −y 側）受拉；N 正 = 拉力；x 由桿件起端量起。</p>`);
    // 桿端力
    const erows = allTruss ? [] : Object.entries(res.members).map(([id, mr]) => `<tr><td>${id}</td><td>${fmt(-mr.f1.fx)}</td><td>${fmt(mr.f1.fy)}</td><td>${fmt(-mr.f1.m)}</td><td>${fmt(-mr.f2.fx)}</td><td>${fmt(-mr.f2.fy)}</td><td>${fmt(mr.f2.m)}</td></tr>`);
    if (!allTruss) html += this.section('r-end', '桿端內力', `<table class="tbl small"><tr><th>桿</th><th>N₁</th><th>V₁</th><th>M₁</th><th>N₂</th><th>V₂</th><th>M₂</th></tr>${erows.join('')}</table><p class="muted">以梁的符號慣例表示（桿端內力，非節點作用力）。</p>`, false);
    // 標準值
    if (res.standard && res.standard.length) {
      html += this.section('r-std', '常用標準值', res.standard.map(s => `<div class="std"><b>${s.title}</b>${s.lines.map(l => `<div>${l}</div>`).join('')}</div>`).join(''));
    }
    // 圖形特徵
    const feats = [];
    const single = Object.keys(res.members).length === 1;
    for (const id in res.members) {
      const mr = res.members[id];
      const label = single ? '' : `桿${id} `;
      feats.push(...Analysis.features(mr, mr, label));
    }
    if (!allTruss) html += this.section('r-feat', '圖形特徵與面積法', feats.length ? `<ul class="feat">${feats.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="muted">無</p>', false);
    // 桁架內力、零桿、截面法、載重上限
    if (res.classification.allTruss) {
      const tolN = 1e-8 * Math.max(1, res.maxAbsN);
      const trows = Object.entries(res.members).map(([id, mr]) => {
        const N = mr.fns.at(mr.geom.L / 2).N;
        const z = res.zero && res.zero.found[id];
        const type = Math.abs(N) < tolN ? `零桿${z ? `（法則 ${z.rule}）` : '（由計算得出）'}` : N > 0 ? '拉力 T' : '壓力 C';
        return `<tr><td>${id}</td><td>${mr.member.n1}–${mr.member.n2}</td><td>${fmt(mr.geom.L)}</td><td>${fmt(N)}</td><td class="${Math.abs(N) < tolN ? 'muted' : N > 0 ? 'tension' : 'compress'}">${type}</td></tr>`;
      });
      html += this.section('r-truss', `桁架桿件內力（${F}）`, `<table class="tbl small"><tr><th>桿</th><th>節點</th><th>長度</th><th>N</th><th>性質</th></tr>${trows.join('')}</table><p class="muted">N 正 = 拉力（T），負 = 壓力（C）。桁架假設：桿件兩端鉸接、載重只作用在節點、桿件為二力桿。</p>`);
      if (res.zero) {
        const z = res.zero;
        const n = Object.keys(z.found).length;
        html += this.section('r-zero', `零桿判定（${n} 根）`, `
          <div class="std"><b>三法則</b>
            <div>法則 1：節點僅連兩根不共線桿件且無外力 → 兩桿皆零桿</div>
            <div>法則 2：節點連三桿，其中兩桿共線且無外力 → 第三桿零桿</div>
            <div>法則 3：節點僅連兩根不共線桿件，外力（或已知方向反力）沿其中一桿 → 另一桿零桿</div></div>
          ${z.steps.length ? `<ul class="feat">${z.steps.map(s => `<li>${s}</li>`).join('')}</ul>` : '<p class="muted">依三法則找不到零桿。</p>'}
          ${z.computedOnly.length ? `<p class="muted">另有由計算得出的零桿（法則無法直接判定）：桿 ${z.computedOnly.join('、')}</p>` : ''}
          <p class="muted">提示：鉸支承節點的反力方向未知，法則不適用；判定出的零桿可視為移除，再對相鄰節點重複判定。</p>`);
      }
      // 載重上限
      const s = model.settings;
      const lim = Analysis.loadLimit(model, res, { allowT: s.allowT, allowC: s.allowC, eulerK: s.eulerK });
      let limInner = this.num(`容許拉力 (${F})`, s.allowT, v => { s.allowT = v; }, { min: 0 }) + this.num(`容許壓力 (${F})`, s.allowC, v => { s.allowC = v; }, { min: 0 }) + this.num('壓桿尤拉挫屈 K（0 = 不檢核）', s.eulerK, v => { s.eulerK = v; }, { min: 0, step: 0.5 });
      if (lim) {
        const c = lim.controlling;
        limInner += `<div class="std"><b>載重倍數 λ = ${fmt(lim.lambda)}</b>
          <div>控制桿件：桿 ${c.id}（${c.type}力 ${fmt(Math.abs(c.N))} → 上限 ${fmt(c.limit)}，${c.how}）</div>
          ${lim.refP ? `<div>目前載重 P = ${fmt(lim.refP)} ${F} → 可承受 P_max = λ·P = ${fmt(lim.lambda * lim.refP)} ${F}</div>` : ''}
          <div class="muted">線性結構：所有內力與載重成比例，各桿 λ_i = 容許值 / |N_i|，取最小者。</div></div>
          <table class="tbl small"><tr><th>桿</th><th>N</th><th>上限</th><th>λ_i</th><th>依據</th></tr>${lim.items.slice(0, 6).map(it => `<tr><td>${it.id}</td><td>${fmt(it.N)}</td><td>${fmt(it.limit)}</td><td>${fmt(it.lambda)}</td><td>${it.how}</td></tr>`).join('')}</table>`;
      } else limInner += '<p class="muted">無內力或未設定容許值。</p>';
      html += this.section('r-limit', '壓桿與載重上限', limInner, false);
    }
    if (this.app.sectionResult) {
      const sc = this.app.sectionResult;
      const cutRows = sc.cut.map(c => `<tr><td>${c.id}</td><td>${c.near}→${c.far}</td><td>(${fmt(c.q[0])}, ${fmt(c.q[1])})</td><td>${fmt(c.N)}</td><td>${Math.abs(c.N) < 1e-9 ? '零' : c.N > 0 ? '拉 T' : '壓 C'}</td></tr>`).join('');
      const extRows = sc.ext.map(e => `<tr><td>${e.node}</td><td>${e.kind}</td><td>${fmt(e.fx)}</td><td>${fmt(e.fy)}</td></tr>`).join('');
      html += this.section('r-sec', '截面法', `
        <div class="row">${this.btn('切換取另一側', () => this.app.flipSection())}${this.btn('清除切割線', () => this.app.clearSection())}</div>
        <p class="muted">取用側：${sc.partLabel}（含節點 ${[...sc.partNodes].join('、') || '無'}）；切到 ${sc.cut.length} 根桿件。</p>
        <b>自由體上的已知力（外力與反力）</b>
        <table class="tbl small"><tr><th>節點</th><th>種類</th><th>Fx</th><th>Fy</th></tr>${extRows || '<tr><td colspan=4 class="muted">無</td></tr>'}</table>
        <b>切割桿件內力（假設為拉力，答案為負即為壓力）</b>
        <table class="tbl small"><tr><th>桿</th><th>方向</th><th>切點</th><th>N</th><th>性質</th></tr>${cutRows}</table>
        <b>求解建議</b>
        <ul class="feat">${sc.suggestions.map(sg => `<li>${sg.text}</li>`).join('')}</ul>
        <p class="muted">自由體平衡檢核：ΣFx = ${fmt(sc.sums.fx)}，ΣFy = ${fmt(sc.sums.fy)}（應為 0）</p>`);
    }
    // 連續梁活載重配置
    if (this.app.cb) {
      const cb = this.app.cb;
      const lv = model.live || (model.live = { wD: 0, wL: 10, pattern: cb.spans.map(() => false), envelope: false });
      while (lv.pattern.length < cb.spans.length) lv.pattern.push(false);
      const applyBtn = (label, pattern) => this.btn(label, () => this.app.applyLive(pattern), 'small');
      let inner = this.num(`靜載重 wD (${F}/${Lu}，全跨）`, lv.wD || 0, v => { lv.wD = v; Analysis.setLivePattern(model, cb, lv.wD, lv.wL || 0, lv.pattern); }, { min: 0 }) +
        this.num(`活載重 wL (${F}/${Lu}）`, lv.wL || 0, v => { lv.wL = v; Analysis.setLivePattern(model, cb, lv.wD || 0, lv.wL, lv.pattern); }, { min: 0 });
      inner += '<div class="sub">各跨活載重</div><div class="row">' + cb.spans.map((sp, i) => `<label class="chip"><input type="checkbox" ${lv.pattern[i] ? 'checked' : ''} data-handler="${this.reg(v => { lv.pattern[i] = v; Analysis.setLivePattern(model, cb, lv.wD || 0, lv.wL || 0, lv.pattern); })}"> ${sp.label}</label>`).join('') + '</div>';
      inner += '<div class="row">' + applyBtn('全部', cb.spans.map(() => true)) + applyBtn('清除', cb.spans.map(() => false)) + applyBtn('隔跨 A', cb.spans.map((_, i) => i % 2 === 0)) + applyBtn('隔跨 B', cb.spans.map((_, i) => i % 2 === 1)) + '</div>';
      inner += '<div class="sub">求最大正彎矩（該跨及隔跨配置）</div><div class="row">' + cb.spans.map((sp, i) => applyBtn(sp.label, Analysis.patternSpanMax(cb, i))).join('') + '</div>';
      const interior = [];
      cb.spans.forEach((sp, i) => { if (i > 0 && !sp.cant && !cb.spans[i - 1].cant) interior.push({ j: i, node: sp.left }); });
      if (interior.length) inner += '<div class="sub">求支承最大負彎矩（相鄰兩跨及隔跨配置）</div><div class="row">' + interior.map(it => applyBtn(`支承 ${it.node}`, Analysis.patternSupportMax(cb, it.j))).join('') + '</div>';
      inner += this.chk('顯示活載重包絡線（彎矩圖虛線，列舉所有配置）', !!lv.envelope, v => { lv.envelope = v; });
      if (this.app.envelope) {
        const env = this.app.envelope;
        const pat = p => p ? p.map(b => (b ? '■' : '□')).join('') : '';
        inner += `<div class="std"><b>包絡線結果（${env.count} 種配置）</b>` +
          env.spanMax.map((s, i) => isFinite(s.M) ? `<div>${cb.spans[i].label} 最大正彎矩 ${fmt(s.M)}（配置 ${pat(s.pattern)}）</div>` : '').join('') +
          cb.supports.map((nd, j) => (j > 0 && j < cb.supports.length - 1) || cb.spans.some(sp => sp.cant) ? `<div>支承 ${nd.id} 最大負彎矩 ${fmt(env.supMin[j].M)}（配置 ${pat(env.supMin[j].pattern)}）</div>` : '').join('') + '</div>';
      }
      inner += '<p class="muted">原則：活載重可動，要使某跨正彎矩最大 → 該跨與隔跨配置；要使某支承負彎矩最大 → 該支承兩側相鄰跨與隔跨配置（棋盤式）。靜載重永遠全跨。</p>';
      html += this.section('r-live', '連續梁活載重配置', inner);
    }
    // 非載重效應比較
    if (this.app.nonLoad) {
      const nl = this.app.nonLoad;
      const rows = nl.comps.map(c => `<tr><td>結構 ${c.idx}<br><small>${c.where}</small></td><td><span class="badge ${c.unstable ? 'unstable' : c.cls.cls}">${c.unstable ? '不穩定' : c.cls.text}</span></td><td>${c.effects.join('<br>')}</td><td>${fmt(c.M)}</td><td>${fmt(c.N)}</td><td>${Analysis.fmtSci(c.disp)}</td><td>${c.cls.n === 0 ? '只變形，不產生內力與反力' : '產生內力（多餘拘束抵抗變形）'}</td></tr>`).join('');
      html += this.section('r-nonload', '非載重效應：沉陷／溫度（只計此效應，不含載重）', `<table class="tbl small"><tr><th>結構</th><th>判別</th><th>效應</th><th>|M|max</th><th>|N|max</th><th>δmax</th><th>結論</th></tr>${rows}</table>
        <p class="muted">靜定結構：支承沉陷、溫度變化、製造誤差、預力只造成位移（剛體運動或自由變形），不產生內力與反力；靜不定結構：多餘拘束抵抗這些變形而產生內力（與 EI 成正比，剛度愈大內力愈大）。</p>`);
    }
    // 三鉸系統 / 拱 / 纜索
    if (res.funicular) {
      const fu = res.funicular;
      const title = fu.isCable ? '纜索分析' : fu.kind === 'three' ? '三鉸系統分析（剛架／拱）' : '拱分析（靜不定）';
      const trows = fu.rows.map(r => `<tr><td>${r.id}${r.hinge ? '（鉸）' : ''}</td><td>${fmt(r.x - fu.A.x)}</td><td>${fmt(r.y)}</td><td>${fmt(r.M0)}</td><td>${fmt(r.Hy)}</td><td>${fmt(r.Mpred)}</td><td>${fmt(r.M)}</td></tr>`);
      html += this.section('r-fun', title, `<div class="formula">H = ${fmt(fu.H)} ${F}，L = ${fmt(fu.L)}，${fu.isCable ? '垂度' : '矢高'} f = ${fmt(fu.f)}，R_A = ${fmt(fu.RA)}，R_B = ${fmt(fu.RB)}${fu.isCable ? `，T_max = ${fmt(fu.maxN)}` : `，N_max = ${fmt(fu.maxN)}`}</div>
        ${fu.lines.map(l => `<div class="std">${l}</div>`).join('')}
        <table class="tbl small"><tr><th>節點</th><th>x</th><th>y</th><th>M0</th><th>H·y</th><th>M0−H·y</th><th>計算 M</th></tr>${trows.join('')}</table>
        <p class="muted">M0 = 同載重之簡支梁彎矩；H·y = 水平推力造成的反向彎矩；兩者相減即為拱／剛架各節點的彎矩。</p>`);
    }
    // 變形判讀
    if (res.deformNotes && res.deformNotes.length) {
      html += this.section('r-def', '變形判讀', `<ul class="feat">${res.deformNotes.map(t => `<li>${t}</li>`).join('')}</ul>
        <p class="muted">判讀原則：剛接節點夾角不變、內鉸可折、固定端切線不轉、彎矩正負決定凹凸方向、反曲點在 M = 0 處；主畫布可勾選「疊加變形」對照。</p>`, false);
    }
    // 節點位移
    const drows = Object.entries(res.disp).map(([id, d]) => `<tr><td>${id}</td><td>${Analysis.fmtSci(d.ux)}</td><td>${Analysis.fmtSci(d.uy)}</td><td>${Analysis.fmtSci(d.rz)}</td></tr>`);
    html += this.section('r-disp', `節點位移（${Lu}、rad）`, `<table class="tbl small"><tr><th>節點</th><th>ux</th><th>uy</th><th>θ</th></tr>${drows.join('')}</table>`, false);
    this.mount(html);
  }
  sumLoads(res) {
    const model = this.model;
    let fx = 0, fy = 0;
    for (const n of model.nodes) { fx += n.loads.fx; fy += n.loads.fy; }
    for (const m of model.members) {
      const g = Model.memberGeom(model, m);
      for (const ld of m.loads) {
        if (ld.type === 'point') { fx += ld.P * Math.cos(ld.angle * Math.PI / 180); fy += ld.P * Math.sin(ld.angle * Math.PI / 180); }
        if (ld.type === 'udl') {
          const W = (ld.w1 + ld.w2) / 2 * (ld.b - ld.a);
          if (ld.dir === 'local') { fx += W * g.s; fy -= W * g.c; }
          else fy -= W * (ld.dir === 'projected' ? Math.abs(g.c) : 1);
        }
      }
    }
    for (const id in res.reactions) { fx += res.reactions[id].fx; fy += res.reactions[id].fy; }
    return { fx, fy };
  }

  // ---- 題庫 ----
  renderLibrary() {
    const list = this.app.library().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }));
    const filter = (this.libFilter || '').trim();
    const shown = filter ? list.filter(it => (it.name + ' ' + (it.note || '')).includes(filter)) : list;
    let html = `<h2>題庫（${list.length} 題）</h2>
      <div class="row">${this.btn('存入目前結構', () => this.app.saveToLibrary())}${this.btn('匯出題庫', () => this.app.exportLibrary())}${this.btn('匯入題庫', () => this.body.querySelector('#lib-import').click())}<input type="file" id="lib-import" accept=".json" style="display:none"></div>
      <label class="field"><span>搜尋</span><input type="text" id="lib-filter" value="${filter}" placeholder="題號或備註"></label>
      <p class="muted">以題號命名（例如 112申3、109-24），備註可寫題目重點或答案。點名稱即載入；載入後開啟「測驗模式」可先遮住答案自我測驗。</p>`;
    if (!shown.length) html += `<p class="muted">${list.length ? '沒有符合的題目' : '題庫是空的。畫好一題後按「存入題庫」。'}</p>`;
    else html += shown.map(it => `<div class="lib-item"><div class="lib-name" data-load="${it.id}"><b>${it.name}</b><small>${it.note ? it.note + '　' : ''}${new Date(it.updated).toLocaleDateString()}</small></div>${this.btn('載入', () => this.app.loadFromLibrary(it.id), 'small')}${this.btn('改名', () => this.app.renameInLibrary(it.id), 'small')}${this.btn('覆蓋', () => { if (confirm(`用目前結構覆蓋「${it.name}」？`)) this.app.saveToLibrary(it.name, it.note); }, 'small')}${this.btn('刪除', () => this.app.deleteFromLibrary(it.id), 'small danger')}</div>`).join('');
    this.mount(html);
    this.body.querySelectorAll('[data-load]').forEach(el => el.addEventListener('click', () => this.app.loadFromLibrary(+el.dataset.load)));
    const f = this.body.querySelector('#lib-filter');
    f.addEventListener('input', () => { this.libFilter = f.value; const pos = f.selectionStart; this.renderLibrary(); const nf = this.body.querySelector('#lib-filter'); nf.focus(); nf.setSelectionRange(pos, pos); });
    this.body.querySelector('#lib-import').addEventListener('change', e => { const file = e.target.files[0]; if (file) file.text().then(t => this.app.importLibrary(t)); });
  }

  // ---- 測驗模式：作答表單 ----
  renderQuiz() {
    const q = this.app.quiz, model = this.model, F = model.settings.forceUnit, Lu = model.settings.lengthUnit;
    const hideChk = (key, label) => `<label class="chip"><input type="checkbox" ${q.hide[key] ? 'checked' : ''} data-hide="${key}"> ${label}</label>`;
    const sups = model.nodes.filter(n => n.support.type !== 'none' && Model.connectedMembers(model, n.id).length);
    const a = q.answers;
    const ansNum = (key, label) => `<label class="field"><span>${label}</span><input type="number" step="any" data-ans="${key}" value="${a[key] ?? ''}" placeholder="我的答案"></label>`;
    let html = `<h2>測驗模式${model.title ? `：${model.title}` : ''}</h2>
      ${model.note ? `<p class="muted">備註：${model.note}</p>` : ''}
      <div class="quiz-box"><b>隱藏項目</b><div class="row">${hideChk('det', '判別')}${hideChk('reactions', '反力')}${hideChk('V', '剪力圖')}${hideChk('M', '彎矩圖')}${hideChk('N', '軸力圖')}${hideChk('D', '變形')}${hideChk('truss', '桁架內力')}</div></div>
      <div class="quiz-box"><b>作答（可只填部分，揭曉後自動對答案）</b>
        <label class="field"><span>穩定性／靜定度</span><select data-ans="det"><option value="">—</option><option value="unstable" ${a.det === 'unstable' ? 'selected' : ''}>不穩定</option><option value="det" ${a.det === 'det' ? 'selected' : ''}>靜定</option><option value="indet" ${a.det === 'indet' ? 'selected' : ''}>靜不定</option></select></label>
        ${ansNum('n', '靜不定次數 n')}
        ${sups.map(n => ansNum('Ry' + n.id, `節點 ${n.id} 反力 Ry (${F}，↑正)`)).join('')}
        ${sups.filter(n => n.support.type === 'pin' || n.support.type === 'fixed').map(n => ansNum('Rx' + n.id, `節點 ${n.id} 反力 Rx (${F}，→正)`)).join('')}
        ${sups.filter(n => n.support.type === 'fixed').map(n => ansNum('Rm' + n.id, `節點 ${n.id} 反力矩 (${F}·${Lu}，↺正)`)).join('')}
        ${ansNum('Mmax', `最大正彎矩 (${F}·${Lu})`)}${ansNum('Mmin', `最大負彎矩（填負值）`)}${ansNum('Vmax', `最大剪力絕對值 (${F})`)}
        ${model.members.some(m => m.truss) ? ansNum('Nmax', `最大拉力 (${F})`) + ansNum('Nmin', `最大壓力（填負值）`) : ''}
      </div>
      <div class="row">${this.btn('揭曉答案', () => this.app.reveal(), 'primary')}${this.btn('結束測驗', () => this.app.setQuiz(false))}</div>
      <p class="muted">畫布上的載重與支承照常顯示，可自由改題；揭曉後結果面板最上方會列出對答結果。</p>`;
    this.mount(html);
    this.body.querySelectorAll('[data-hide]').forEach(el => el.addEventListener('change', () => { q.hide[el.dataset.hide] = el.checked; this.app.redraw(); this.app.updateStatus(); }));
    this.body.querySelectorAll('[data-ans]').forEach(el => el.addEventListener('change', () => { const v = el.tagName === 'SELECT' ? el.value : parseFloat(el.value); q.answers[el.dataset.ans] = el.tagName === 'SELECT' ? v : (isFinite(v) ? v : undefined); }));
  }
  // 揭曉後的對答結果
  quizReviewHtml() {
    const q = this.app.quiz, res = this.app.result, model = this.model, fmt = Analysis.fmt;
    const a = q.answers;
    const rows = [];
    const close = (mine, truth) => Math.abs(mine - truth) <= Math.max(0.02 * Math.abs(truth), 0.05);
    const cl = res.classification;
    if (a.det) { const truth = res.unstable || cl.n < 0 ? 'unstable' : cl.n === 0 ? 'det' : 'indet'; const name = { unstable: '不穩定', det: '靜定', indet: '靜不定' }; rows.push(['判別', name[a.det], name[truth], a.det === truth]); }
    if (a.n !== undefined) rows.push(['n', fmt(a.n), fmt(cl.n), a.n === cl.n]);
    if (res.ok) {
      for (const id in res.reactions) {
        const r = res.reactions[id];
        if (a['Ry' + id] !== undefined) rows.push([`節點 ${id} Ry`, fmt(a['Ry' + id]), fmt(r.fy), close(a['Ry' + id], r.fy)]);
        if (a['Rx' + id] !== undefined) rows.push([`節點 ${id} Rx`, fmt(a['Rx' + id]), fmt(r.fx), close(a['Rx' + id], r.fx)]);
        if (a['Rm' + id] !== undefined) rows.push([`節點 ${id} M`, fmt(a['Rm' + id]), fmt(r.m), close(a['Rm' + id], r.m)]);
      }
      let Mmax = -Infinity, Mmin = Infinity, Vmax = 0, Nmax = -Infinity, Nmin = Infinity;
      for (const id in res.members) { const mr = res.members[id]; Mmax = Math.max(Mmax, mr.maxM.M); Mmin = Math.min(Mmin, mr.minM.M); Vmax = Math.max(Vmax, Math.abs(mr.maxV.V), Math.abs(mr.minV.V)); Nmax = Math.max(Nmax, mr.maxN.N); Nmin = Math.min(Nmin, mr.minN.N); }
      if (a.Mmax !== undefined) rows.push(['最大正彎矩', fmt(a.Mmax), fmt(Mmax), close(a.Mmax, Mmax)]);
      if (a.Mmin !== undefined) rows.push(['最大負彎矩', fmt(a.Mmin), fmt(Mmin), close(a.Mmin, Mmin)]);
      if (a.Vmax !== undefined) rows.push(['|V|max', fmt(a.Vmax), fmt(Vmax), close(a.Vmax, Vmax)]);
      if (a.Nmax !== undefined) rows.push(['最大拉力', fmt(a.Nmax), fmt(Nmax), close(a.Nmax, Nmax)]);
      if (a.Nmin !== undefined) rows.push(['最大壓力', fmt(a.Nmin), fmt(Nmin), close(a.Nmin, Nmin)]);
    }
    const okCount = rows.filter(r => r[3]).length;
    return this.section('r-quiz', `測驗結果：${rows.length ? `${okCount} / ${rows.length} 正確` : '未作答'}`, `
      ${rows.length ? `<table class="tbl small"><tr><th>項目</th><th>我的答案</th><th>正解</th><th></th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="${r[3] ? 'ok-mark' : 'bad-mark'}">${r[3] ? '✓' : '✗'}</td></tr>`).join('')}</table><p class="muted">數值容許誤差 2%。</p>` : '<p class="muted">沒有填寫答案，直接揭曉。</p>'}
      <div class="row">${this.btn('再測一次（重新隱藏）', () => this.app.resetQuiz())}${this.btn('結束測驗', () => this.app.setQuiz(false))}</div>`);
  }

  // ---- 設定 ----
  renderSettings() {
    const s = this.model.settings;
    let html = '<h2>設定</h2>';
    html += this.section('s-unit', '單位（僅更改標示）', this.sel('力', s.forceUnit, [['kN', 'kN'], ['tf', 'tf'], ['N', 'N'], ['kgf', 'kgf']], v => { s.forceUnit = v; }) + this.sel('長度', s.lengthUnit, [['m', 'm'], ['cm', 'cm'], ['mm', 'mm']], v => { s.lengthUnit = v; }) + '<p class="muted">所有輸入值請使用同一組單位（例如 kN、m、kN/m²）。</p>');
    html += this.section('s-def', '新桿件預設值', this.num('E', s.E, v => { s.E = v; }) + this.num('A', s.A, v => { s.A = v; }) + this.num('I', s.I, v => { s.I = v; }) + this.num('熱膨脹係數 α (1/°C)', s.alpha, v => { s.alpha = v; }) + this.btn('套用到所有桿件', () => { for (const m of this.model.members) { m.E = s.E; m.A = s.A; m.I = s.I; } this.app.commit(); }));
    html += this.section('s-truss', '桁架', this.chk('桁架模式（新桿件為桁架桿、載重只加在節點）', s.trussMode, v => { s.trussMode = v; this.app.syncStatusControls(); }) + this.chk('全桁架時在桿件上標示軸力與拉壓', s.showTrussForces, v => { s.showTrussForces = v; }) + this.btn('全部桿件設為桁架桿', () => { for (const m of this.model.members) m.truss = true; this.app.commit(); }) + this.btn('全部桿件設為剛架桿', () => { for (const m of this.model.members) m.truss = false; this.app.commit(); }));
    html += this.section('s-view', '顯示', this.sel('格點間距', String(s.snap), [['0.1', '0.1'], ['0.25', '0.25'], ['0.5', '0.5'], ['1', '1']], v => { s.snap = parseFloat(v); }) + this.chk('彎矩圖畫在受拉側（剛架習慣）', s.tensionSide, v => { s.tensionSide = v; }) + this.chk('顯示反力', s.showReactions, v => { s.showReactions = v; }) + this.chk('顯示圖上數值', s.showValues, v => { s.showValues = v; }) + this.chk('顯示桿件長度', s.showDims, v => { s.showDims = v; }) + this.chk('主畫布疊加變形曲線', s.showDeformed, v => { s.showDeformed = v; this.app.syncStatusControls(); }) + this.num('變形放大倍率（相對）', s.deformScale, v => { s.deformScale = v; this.app.syncStatusControls(); }, { min: 0.1, step: 0.5 }));
    this.mount(html);
  }
}
