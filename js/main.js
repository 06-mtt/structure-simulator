// 應用程式主控：工具列、復原/重做、自動儲存、重新計算
const App = {
  model: null, result: null, editor: null, diagrams: null, panels: null,
  section: null, sectionResult: null, cb: null, envelope: null, nonLoad: null,
  mechIndex: 0, compareA: null,
  LIB_KEY: 'structsim.library.v1',
  quiz: { on: false, revealed: false, hide: { reactions: true, V: true, M: true, N: true, D: true, det: true, truss: true }, answers: {} },
  undoStack: [], redoStack: [], STORAGE_KEY: 'structsim.model.v1',

  init() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      this.model = saved ? Model.deserialize(saved) : Model.presets[0].build();
    } catch (e) { this.model = Model.presets[0].build(); }
    this.editor = new Editor(document.getElementById('structure'), this);
    this.diagrams = new Diagrams(document.getElementById('diagrams'), this);
    this.panels = new Panels(document.getElementById('side'), this);
    this.buildToolbar();
    this.editor.fitView();
    this.recompute(true);
    this.panels.render();
    // 版面配置完成後再置中一次
    requestAnimationFrame(() => { this.editor.resize(); this.editor.fitView(); this.redraw(); });
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const map = { v: 'select', m: 'member', p: 'load-point', u: 'load-udl', c: 'load-moment', h: 'hinge', x: 'delete', s: 'section', '1': 'sup-pin', '2': 'sup-roller', '3': 'sup-fixed', '4': 'sup-guide', '5': 'sup-spring' };
        const t = map[e.key.toLowerCase()];
        if (t) this.editor.setTool(t);
        if (e.key === 'f') { this.editor.fitView(); this.redraw(); }
      }
    });
  },

  buildToolbar() {
    const tb = document.getElementById('toolbar');
    const groups = [
      ['編輯', [['select', '選取 (V)'], ['member', '桿件 (M)'], ['delete', '刪除 (X)']]],
      ['支承', [['sup-pin', '鉸 (1)'], ['sup-roller', '滾 (2)'], ['sup-fixed', '固定 (3)'], ['sup-guide', '導向 (4)'], ['sup-spring', '彈簧 (5)']]],
      ['接頭', [['hinge', '內鉸 (H)']]],
      ['載重', [['load-point', '集中力 (P)'], ['load-udl', '分布 (U)'], ['load-moment', '彎矩 (C)'], ['load-temp', '溫度']]],
      ['桁架', [['section', '截面法 (S)']]],
    ];
    let html = '';
    for (const [name, tools] of groups) {
      html += `<div class="tgroup"><span class="tgroup-name">${name}</span>${tools.map(([id, label]) => `<button class="tool" data-tool="${id}">${label}</button>`).join('')}</div>`;
    }
    html = html.replace('<button class="tool" data-tool="section">', '<label class="tb-check" title="新桿件為桁架桿，載重只加在節點"><input type="checkbox" id="chk-truss"> 桁架模式</label><button class="tool" data-tool="section">');
    html += `<div class="tgroup"><span class="tgroup-name">檔案</span>
      <select id="presets"><option value="">範例…</option>${Model.presets.map((p, i) => `<option value="${i}">${p.group}：${p.name}</option>`).join('')}</select>
      <button id="btn-arch" title="產生拱、纜索或山形剛架">拱／纜索…</button>
      <button id="btn-calc" title="斷面性質、分段軸力、柱側向勁度與週期、柱挫屈">小計算器</button>
      <button id="btn-new">新檔</button><button id="btn-export">匯出</button><button id="btn-import">匯入</button><input type="file" id="file-import" accept=".json" style="display:none">
      </div>
      <div class="tgroup"><span class="tgroup-name">檢視</span><button id="btn-undo" title="Ctrl+Z">復原</button><button id="btn-redo" title="Ctrl+Y">重做</button><button id="btn-fit" title="F">置中</button></div>
      <div class="tgroup"><span class="tgroup-name">題庫</span><button id="btn-save-lib" title="把目前結構存入題庫（以題號命名）">存入題庫</button><button id="btn-open-lib">開啟題庫</button></div>
      <div class="tgroup"><span class="tgroup-name">測驗</span><label class="tb-check" title="隱藏反力、內力圖與判別結果，自己作答後再揭曉"><input type="checkbox" id="chk-quiz"> 測驗模式</label><button id="btn-reveal" style="display:none">揭曉答案</button></div>
      <div class="tgroup"><span class="tgroup-name">A/B</span><button id="btn-setA" title="把目前結構記錄為 A，之後的修改即為 B，結果面板會比較兩者">記錄為 A</button><button id="btn-loadA" title="把 A 載回畫布">載入 A</button><button id="btn-clearA">清除 A</button></div>`;
    tb.innerHTML = html;
    tb.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => this.editor.setTool(b.dataset.tool)));
    this.onToolChanged('select');
    document.getElementById('presets').addEventListener('change', e => {
      const i = e.target.value; if (i === '') return;
      this.load(Model.presets[+i].build()); e.target.value = '';
    });
    document.getElementById('btn-new').addEventListener('click', () => { const m = Model.createEmpty(); m.settings = { ...this.model.settings }; this.load(m); });
    document.getElementById('btn-export').addEventListener('click', () => {
      const name = prompt('檔名（例如 112申3）', '結構') || '結構';
      const blob = new Blob([Model.serialize(this.model)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.json'; a.click();
    });
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());
    document.getElementById('file-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { try { this.load(Model.deserialize(t)); } catch (err) { alert('讀取失敗：' + err.message); } });
      e.target.value = '';
    });
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-fit').addEventListener('click', () => { this.editor.fitView(); this.redraw(); });
    document.getElementById('btn-save-lib').addEventListener('click', () => this.saveToLibrary());
    document.getElementById('btn-open-lib').addEventListener('click', () => this.panels.setTab('library'));
    document.getElementById('chk-quiz').addEventListener('change', e => this.setQuiz(e.target.checked));
    document.getElementById('btn-reveal').addEventListener('click', () => this.reveal());
    document.getElementById('btn-calc').addEventListener('click', () => window.open('calculators.html', '_blank'));
    document.getElementById('btn-setA').addEventListener('click', () => this.setCompareA());
    document.getElementById('btn-loadA').addEventListener('click', () => { if (this.compareA) this.load(Model.clone(this.compareA.model)); });
    document.getElementById('btn-clearA').addEventListener('click', () => { this.compareA = null; this.redraw(); this.panels.render(); });
    document.getElementById('chk-truss').addEventListener('change', e => { this.model.settings.trussMode = e.target.checked; this.commit(); });
    // 變形疊加控制
    document.getElementById('chk-deformed').addEventListener('change', e => { this.model.settings.showDeformed = e.target.checked; this.commit(); });
    document.getElementById('rng-deform').addEventListener('input', e => { this.model.settings.deformScale = parseFloat(e.target.value); this.editor.draw(); });
    document.getElementById('rng-deform').addEventListener('change', () => this.commit());
    this.syncStatusControls();
    // 拱／纜索產生器
    const dlg = document.getElementById('dlg-arch');
    const kindSel = document.getElementById('ar-kind');
    const updateRows = () => {
      const k = kindSel.value;
      document.getElementById('ar-shape-row').classList.toggle('hidden', k === 'gable3');
      document.getElementById('ar-n-row').classList.toggle('hidden', k === 'gable3');
      document.getElementById('ar-height-row').classList.toggle('hidden', k !== 'gable3');
      document.getElementById('ar-mode-row').classList.toggle('hidden', k === 'cable');
    };
    kindSel.addEventListener('change', updateRows);
    document.getElementById('btn-arch').addEventListener('click', () => { updateRows(); dlg.classList.remove('hidden'); });
    document.getElementById('ar-cancel').addEventListener('click', () => dlg.classList.add('hidden'));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.classList.add('hidden'); });
    document.getElementById('ar-ok').addEventListener('click', () => {
      const v = id => parseFloat(document.getElementById(id).value);
      const o = { kind: kindSel.value, shape: document.getElementById('ar-shape').value, span: v('ar-span'), rise: v('ar-rise'), height: v('ar-height'), n: v('ar-n'), w: v('ar-w') || 0, P: v('ar-P') || 0, loadMode: document.getElementById('ar-mode').value };
      if (!(o.span > 0) || !(o.rise > 0)) { alert('跨度與矢高必須大於 0'); return; }
      const m = Model.generate(o);
      m.settings = { ...this.model.settings, snap: 0.1 };
      dlg.classList.add('hidden');
      this.load(m);
    });
  },
  syncStatusControls() {
    const s = this.model.settings;
    document.getElementById('chk-deformed').checked = !!s.showDeformed;
    document.getElementById('rng-deform').value = s.deformScale || 1;
    document.getElementById('chk-truss').checked = !!s.trussMode;
  },
  // ---- 題庫（localStorage）----
  library() {
    try { return JSON.parse(localStorage.getItem(this.LIB_KEY) || '[]'); } catch (e) { return []; }
  },
  writeLibrary(list) {
    try { localStorage.setItem(this.LIB_KEY, JSON.stringify(list)); } catch (e) { alert('題庫儲存失敗：' + e.message); }
  },
  saveToLibrary(nameArg, noteArg) {
    const list = this.library();
    const name = nameArg !== undefined ? nameArg : prompt('題目名稱（例如 112申3、109-24）', this.model.title || '');
    if (!name) return;
    const note = noteArg !== undefined ? noteArg : (this.model.note || '');
    const existing = list.find(it => it.name === name);
    if (existing && nameArg === undefined && !confirm(`題庫已有「${name}」，要覆蓋嗎？`)) return;
    this.model.title = name; this.model.note = note;
    const item = { id: existing ? existing.id : Date.now(), name, note, updated: new Date().toISOString(), model: Model.serialize(this.model) };
    if (existing) Object.assign(existing, item); else list.push(item);
    this.writeLibrary(list);
    this.recompute(true);
    this.panels.setTab('library');
  },
  loadFromLibrary(id) {
    const it = this.library().find(x => x.id === id);
    if (!it) return;
    const m = Model.deserialize(it.model);
    m.title = it.name; m.note = it.note;
    this.load(m);
    if (this.quiz.on) { this.quiz.revealed = false; this.quiz.answers = {}; this.redraw(); }
    this.panels.setTab(this.quiz.on ? 'results' : 'props');
  },
  deleteFromLibrary(id) {
    const list = this.library(); const it = list.find(x => x.id === id);
    if (!it || !confirm(`刪除「${it.name}」？`)) return;
    this.writeLibrary(list.filter(x => x.id !== id)); this.panels.render();
  },
  renameInLibrary(id) {
    const list = this.library(); const it = list.find(x => x.id === id);
    if (!it) return;
    const name = prompt('新名稱', it.name); if (!name) return;
    const note = prompt('備註（可空白）', it.note || '');
    it.name = name; it.note = note || ''; it.updated = new Date().toISOString();
    this.writeLibrary(list); this.panels.render();
  },
  exportLibrary() {
    const blob = new Blob([JSON.stringify(this.library(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '結構題庫.json'; a.click();
  },
  importLibrary(text) {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('格式不符');
      const list = this.library();
      let added = 0, replaced = 0;
      for (const it of arr) {
        if (!it || !it.name || !it.model) continue;
        const ex = list.find(x => x.name === it.name);
        if (ex) { Object.assign(ex, { note: it.note || '', model: it.model, updated: it.updated || new Date().toISOString() }); replaced++; }
        else { list.push({ id: it.id || Date.now() + added, name: it.name, note: it.note || '', updated: it.updated || new Date().toISOString(), model: it.model }); added++; }
      }
      this.writeLibrary(list); this.panels.render();
      alert(`匯入完成：新增 ${added} 題、更新 ${replaced} 題`);
    } catch (e) { alert('匯入失敗：' + e.message); }
  },

  // ---- 測驗模式 ----
  setQuiz(on) {
    this.quiz.on = on; this.quiz.revealed = false; this.quiz.answers = {};
    document.getElementById('chk-quiz').checked = on;
    document.getElementById('btn-reveal').style.display = on ? '' : 'none';
    this.redraw(); this.updateStatus();
    this.panels.setTab(on ? 'results' : 'props');
  },
  reveal() {
    this.quiz.revealed = true;
    document.getElementById('btn-reveal').style.display = 'none';
    this.redraw(); this.updateStatus(); this.panels.setTab('results');
  },
  resetQuiz() { this.quiz.revealed = false; this.quiz.answers = {}; document.getElementById('btn-reveal').style.display = ''; this.redraw(); this.updateStatus(); this.panels.render(); },
  // 目前是否要隱藏某類答案
  hidden(kind) { return this.quiz.on && !this.quiz.revealed && this.quiz.hide[kind]; },

  // A/B 比較：記錄目前結構與其結果為 A
  setCompareA() {
    const model = Model.clone(this.model);
    let result = null;
    try { result = Analysis.run(model); } catch (e) { console.error(e); }
    this.compareA = { model, result, time: new Date().toLocaleTimeString() };
    this.redraw(); this.panels.setTab('results');
  },
  setMechIndex(i) { this.mechIndex = i; this.redraw(); this.panels.render(); },
  // 活載重配置
  applyLive(pattern) {
    const lv = this.model.live || (this.model.live = { wD: 0, wL: 10, pattern: [], envelope: false });
    if (!this.cb) return;
    lv.pattern = pattern;
    Analysis.setLivePattern(this.model, this.cb, lv.wD || 0, lv.wL || 0, pattern);
    this.commit();
  },
  // 截面法切割線（不存入模型）
  setSection(line) {
    this.section = line;
    this.updateSection();
    this.redraw();
    this.panels.setTab('results');
  },
  flipSection() { if (this.section) { this.section.side = this.section.side === 'L' ? 'R' : 'L'; this.updateSection(); this.redraw(); this.panels.render(); } },
  clearSection() { this.section = null; this.sectionResult = null; this.redraw(); this.panels.render(); },
  updateSection() {
    this.sectionResult = (this.section && this.result && this.result.ok) ? Analysis.sectionCut(this.model, this.result, this.section) : null;
  },

  load(model) {
    this.pushUndo();
    this.model = model;
    this.section = null; this.sectionResult = null; this.mechIndex = 0;
    if (model.meta) this.diagrams.setVisible('N', true); // 拱與纜索以軸力為主
    this.editor.selection = null; this.editor.pending = null;
    this.editor.fitView();
    this.recompute(true);
    if (this.result && this.result.ok && this.result.classification.allTruss) { // 桁架只看軸力
      this.diagrams.setVisible('N', true); this.diagrams.setVisible('V', false); this.diagrams.setVisible('M', false); this.diagrams.draw();
    }
    this.panels.render();
  },
  pushUndo() {
    this.undoStack.push(Model.serialize(this.model));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  },
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(Model.serialize(this.model));
    this.model = Model.deserialize(this.undoStack.pop());
    this.editor.selection = null;
    this.recompute(true); this.panels.render();
  },
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(Model.serialize(this.model));
    this.model = Model.deserialize(this.redoStack.pop());
    this.editor.selection = null;
    this.recompute(true); this.panels.render();
  },

  // 模型被修改後呼叫：記錄復原點、重算、更新面板
  commit() {
    // 修改已經發生；把修改前狀態放進 undo 需要在修改前快照，這裡用「上一個已知狀態」
    if (this.lastSnapshot !== undefined) {
      this.undoStack.push(this.lastSnapshot);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    this.recompute(true);
    this.panels.render();
  },
  recompute(save) {
    try { this.result = Analysis.run(this.model); }
    catch (e) { console.error(e); this.result = { ok: false, unstable: false, message: '計算錯誤：' + e.message, warnings: [], classification: Solver.classify(this.model) }; }
    this.updateSection();
    // 連續梁活載重包絡線、非載重效應
    try {
      this.cb = Analysis.continuousBeam(this.model);
      const lv = this.model.live;
      this.envelope = (this.cb && lv && lv.envelope && this.result.ok) ? Analysis.envelope(this.model, this.cb, lv.wD || 0, lv.wL || 0) : null;
      this.nonLoad = save ? Analysis.nonLoadEffects(this.model) : this.nonLoad;
    } catch (e) { console.error(e); this.cb = null; this.envelope = null; }
    if (save) {
      this.lastSnapshot = Model.serialize(this.model);
      try { localStorage.setItem(this.STORAGE_KEY, this.lastSnapshot); } catch (e) { /* ignore */ }
    }
    this.redraw();
    this.updateStatus();
    if (document.getElementById('chk-deformed')) this.syncStatusControls();
    if (!save && this.panels.tab === 'results') this.panels.render();
  },
  redraw() { this.editor.draw(); this.diagrams.draw(); },
  updateStatus() {
    const el = document.getElementById('status-det');
    const res = this.result;
    const cl = res && res.classification ? res.classification : Solver.classify(this.model);
    let text = cl.text, cls = cl.cls;
    if (res && res.unstable) { text = '不穩定（幾何）'; cls = 'unstable'; }
    if (this.model.meta && this.model.meta.kind === 'cable') { text = '纜索（判別不適用）'; cls = 'none'; }
    if (this.hidden('det')) { text = '測驗中（判別已隱藏）'; cls = 'none'; }
    el.textContent = text; el.className = 'badge ' + cls;
    const t = document.getElementById('status-title');
    if (t) t.textContent = this.model.title ? `題目：${this.model.title}` : '';
  },

  onToolChanged(t) {
    document.querySelectorAll('#toolbar .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    const hints = {
      select: '點選物件；拖曳節點或載重可移動；空白處拖曳平移', member: '點第一點再點第二點畫桿件；Shift 連續畫；右鍵或 Esc 取消',
      delete: '點選要刪除的節點、桿件或載重', hinge: '點節點加入或移除內鉸；點桿件中段會先分割',
      'load-point': '點桿件加集中力；點節點加節點力（預設 10 向下）', 'load-udl': '在桿件上拖曳指定範圍；單點即全長',
      'load-moment': '點桿件或節點加集中彎矩', 'load-temp': '點桿件加入或移除均勻溫度變化',
      section: '在桁架上拖曳畫一條切割線（會無限延伸）；結果面板顯示自由體與各桿求法，可切換取左／右側',
    };
    const h = hints[t] || (t.startsWith('sup-') ? '點節點設定支承（再點一次移除）；點桿件中段會自動加節點' : '');
    document.getElementById('status-hint').textContent = h;
  },
  onSelectionChanged() { if (this.panels.tab !== 'results') this.panels.setTab('props'); else this.panels.render(); },
  onHover(h, wx, wy) {
    document.getElementById('status-pos').textContent = `x = ${Analysis.fmt(wx)}, y = ${Analysis.fmt(wy)}`;
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
