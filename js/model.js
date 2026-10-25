// 結構資料模型：節點、桿件、支承、載重，以及序列化與範例
const Model = (() => {
  const DEFAULT_SETTINGS = {
    forceUnit: 'kN', lengthUnit: 'm',
    E: 2.0e8,      // kN/m²（鋼 200 GPa）
    A: 0.01,       // m²
    I: 1.0e-4,     // m⁴
    alpha: 1.2e-5, // 1/°C
    snap: 0.5,
    tensionSide: true,   // 彎矩圖畫在受拉側
    showReactions: true,
    showValues: true,
    showDims: true,
    showDeformed: false,  // 主畫布疊加變形
    deformScale: 1,       // 變形放大倍率（相對於自動比例）
    trussMode: false,     // 新桿件為桁架桿、載重只加在節點
    showTrussForces: true,// 全桁架時在桿件上標示軸力
    allowT: 100,          // 桿件容許拉力
    allowC: 100,          // 桿件容許壓力
    eulerK: 0,            // 壓桿尤拉挫屈有效長度係數（0 = 不檢核）
  };

  function createEmpty() {
    return { nextId: 1, nodes: [], members: [], settings: { ...DEFAULT_SETTINGS } };
  }
  function newId(model) { return model.nextId++; }
  function node(model, id) { return model.nodes.find(n => n.id === id); }
  function member(model, id) { return model.members.find(m => m.id === id); }

  function makeNode(model, x, y) {
    return {
      id: newId(model), x, y,
      support: { type: 'none', angle: 0, kx: 0, ky: 0, kr: 0 },
      hinge: false,
      loads: { fx: 0, fy: 0, m: 0 },
      settle: { dx: 0, dy: 0, rz: 0 },
    };
  }

  function findNodeAt(model, x, y, tol = 1e-6) {
    return model.nodes.find(n => Math.abs(n.x - x) < tol && Math.abs(n.y - y) < tol) || null;
  }

  function memberGeom(model, m) {
    const a = node(model, m.n1), b = node(model, m.n2);
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, L, c: L > 0 ? dx / L : 1, s: L > 0 ? dy / L : 0 };
  }

  // 點 (x,y) 若落在桿件上（不含端點），回傳沿桿距離；否則 null
  function pointOnMember(model, m, x, y, tol = 1e-6) {
    const g = memberGeom(model, m);
    if (g.L < 1e-9) return null;
    const t = ((x - g.x1) * g.c + (y - g.y1) * g.s);
    const d = Math.abs(-(x - g.x1) * g.s + (y - g.y1) * g.c);
    if (d > tol) return null;
    if (t <= tol || t >= g.L - tol) return null;
    return t;
  }
  function findMemberAt(model, x, y, tol = 1e-6) {
    for (const m of model.members) {
      const t = pointOnMember(model, m, x, y, tol);
      if (t !== null) return { member: m, t };
    }
    return null;
  }

  // 新增節點；若座標已有節點則回傳既有節點；若落在桿件中段則自動分割桿件
  function addNode(model, x, y) {
    const ex = findNodeAt(model, x, y);
    if (ex) return ex;
    const n = makeNode(model, x, y);
    model.nodes.push(n);
    const hit = findMemberAt(model, x, y);
    if (hit) splitMember(model, hit.member, n, hit.t);
    return n;
  }

  function findMember(model, n1, n2) {
    return model.members.find(m => (m.n1 === n1 && m.n2 === n2) || (m.n1 === n2 && m.n2 === n1)) || null;
  }

  function addMember(model, n1, n2, props = {}) {
    if (n1 === n2) return null;
    const ex = findMember(model, n1, n2);
    if (ex) return ex;
    const s = model.settings;
    const m = {
      id: newId(model), n1, n2,
      E: s.E, A: s.A, I: s.I,
      truss: false, release1: false, release2: false,
      loads: [],
      ...props,
    };
    model.members.push(m);
    return m;
  }

  // 在距 n1 為 t 的位置分割桿件，載重依位置分配
  function splitMember(model, m, nd, t) {
    const g = memberGeom(model, m);
    const L = g.L;
    const m2 = {
      id: newId(model), n1: nd.id, n2: m.n2,
      E: m.E, A: m.A, I: m.I, truss: m.truss,
      release1: false, release2: m.release2, loads: [],
    };
    m.n2 = nd.id;
    m.release2 = false;
    const keep = [];
    for (const ld of m.loads) {
      if (ld.type === 'point' || ld.type === 'moment') {
        if (ld.pos <= t + 1e-9) keep.push(ld);
        else m2.loads.push({ ...ld, pos: ld.pos - t });
      } else if (ld.type === 'udl') {
        const a = ld.a, b = ld.b;
        if (b <= t + 1e-9) keep.push(ld);
        else if (a >= t - 1e-9) m2.loads.push({ ...ld, a: a - t, b: b - t });
        else {
          const wt = ld.w1 + (ld.w2 - ld.w1) * (t - a) / (b - a);
          keep.push({ ...ld, b: t, w2: wt });
          m2.loads.push({ ...ld, a: 0, b: b - t, w1: wt });
        }
      } else if (ld.type === 'temp') {
        keep.push(ld);
        m2.loads.push({ ...ld });
      }
    }
    m.loads = keep;
    model.members.push(m2);
    return m2;
  }

  function removeMember(model, id) {
    model.members = model.members.filter(m => m.id !== id);
  }
  function removeNode(model, id) {
    model.members = model.members.filter(m => m.n1 !== id && m.n2 !== id);
    model.nodes = model.nodes.filter(n => n.id !== id);
  }
  function moveNode(model, nd, x, y) {
    if (findNodeAt(model, x, y) && !(Math.abs(nd.x - x) < 1e-9 && Math.abs(nd.y - y) < 1e-9)) return false;
    nd.x = x; nd.y = y;
    // 位置變動後，確保桿件載重位置不超出桿長
    for (const m of model.members) {
      if (m.n1 !== nd.id && m.n2 !== nd.id) continue;
      const L = memberGeom(model, m).L;
      for (const ld of m.loads) {
        if (ld.type === 'point' || ld.type === 'moment') ld.pos = Math.min(Math.max(ld.pos, 0), L);
        if (ld.type === 'udl') { ld.a = Math.min(ld.a, L); ld.b = Math.min(ld.b, L); if (ld.b < ld.a) ld.b = ld.a; }
      }
    }
    return true;
  }

  function connectedMembers(model, nodeId) {
    return model.members.filter(m => m.n1 === nodeId || m.n2 === nodeId);
  }

  // ---- 載重工廠 ----
  function newPointLoad(pos, P = 10, angle = -90) { return { type: 'point', pos, P, angle }; }
  function newUDL(a, b, w = 10, dir = 'global') { return { type: 'udl', a, b, w1: w, w2: w, dir }; }
  function newMoment(pos, M = 10) { return { type: 'moment', pos, M }; }
  // dT：均勻溫度變化；dTd：底面減頂面的溫差（梯度）；h：斷面深度
  function newTemp(dT = 20, dTd = 0, h = 0.5) { return { type: 'temp', dT, dTd, h }; }

  // ---- 序列化 ----
  function serialize(model) { return JSON.stringify(model, null, 1); }
  function deserialize(str) {
    const obj = JSON.parse(str);
    const model = createEmpty();
    model.settings = { ...DEFAULT_SETTINGS, ...(obj.settings || {}) };
    model.nodes = (obj.nodes || []).map(n => ({
      id: n.id, x: n.x, y: n.y,
      support: { type: 'none', angle: 0, kx: 0, ky: 0, kr: 0, ...(n.support || {}) },
      hinge: !!n.hinge,
      loads: { fx: 0, fy: 0, m: 0, ...(n.loads || {}) },
      settle: { dx: 0, dy: 0, rz: 0, ...(n.settle || {}) },
    }));
    model.members = (obj.members || []).map(m => ({
      id: m.id, n1: m.n1, n2: m.n2,
      E: m.E ?? model.settings.E, A: m.A ?? model.settings.A, I: m.I ?? model.settings.I,
      truss: !!m.truss, release1: !!m.release1, release2: !!m.release2,
      loads: (m.loads || []).map(l => ({ ...l })),
    }));
    let maxId = 0;
    for (const n of model.nodes) maxId = Math.max(maxId, n.id);
    for (const m of model.members) maxId = Math.max(maxId, m.id);
    model.nextId = Math.max(obj.nextId || 0, maxId + 1);
    if (obj.meta) model.meta = { ...obj.meta };
    if (obj.live) model.live = { ...obj.live, pattern: [...(obj.live.pattern || [])] };
    if (obj.title) model.title = obj.title;
    if (obj.note) model.note = obj.note;
    return model;
  }
  function clone(model) { return deserialize(serialize(model)); }

  // ---- 拱 / 纜索 / 山形剛架產生器 ----
  // o: {kind:'arch3'|'arch2'|'archFixed'|'cable'|'gable3', shape:'parabola'|'circle'|'triangle', span, rise, height, n, w, P, loadMode:'projected'|'nodal'}
  function generate(o) {
    const model = createEmpty();
    const r6 = v => Math.round(v * 1e9) / 1e9;
    const L = o.span, f = o.rise;
    model.settings.snap = 0.1;
    const addLoads = (members, nodesList) => {
      if (o.w) {
        if (o.loadMode === 'nodal' || o.kind === 'cable') {
          for (let i = 1; i < nodesList.length - 1; i++) {
            const dx = (nodesList[i + 1].x - nodesList[i - 1].x) / 2;
            nodesList[i].loads.fy -= o.w * dx;
          }
        } else {
          for (const m of members) { const g = memberGeom(model, m); m.loads.push({ type: 'udl', a: 0, b: g.L, w1: o.w, w2: o.w, dir: 'projected' }); }
        }
      }
      if (o.P) nodesList[Math.floor(nodesList.length / 2)].loads.fy -= o.P;
    };
    if (o.kind === 'gable3') {
      const h = o.height;
      const a = addNode(model, 0, 0), b = addNode(model, 0, h), c = addNode(model, r6(L / 2), r6(h + f)), d = addNode(model, L, h), e = addNode(model, L, 0);
      a.support.type = 'pin'; e.support.type = 'pin'; c.hinge = true;
      addMember(model, a.id, b.id); const m1 = addMember(model, b.id, c.id); const m2 = addMember(model, c.id, d.id); addMember(model, d.id, e.id);
      addLoads([m1, m2], [b, c, d]);
      model.meta = { kind: 'gable3', span: L, rise: f, height: h, shape: 'triangle' };
      return model;
    }
    const n = Math.max(2, Math.round(o.n / 2) * 2);
    const shapeY = x => {
      if (o.shape === 'circle') { const R = (L * L / 4 + f * f) / (2 * f); return Math.sqrt(Math.max(0, R * R - (x - L / 2) ** 2)) + f - R; }
      if (o.shape === 'triangle') return x <= L / 2 ? 2 * f * x / L : 2 * f * (L - x) / L;
      return 4 * f * x * (L - x) / (L * L);
    };
    const sign = o.kind === 'cable' ? -1 : 1;
    const nodes = [];
    for (let i = 0; i <= n; i++) { const x = L * i / n; nodes.push(addNode(model, r6(x), r6(sign * shapeY(x)))); }
    const supType = o.kind === 'archFixed' ? 'fixed' : 'pin';
    nodes[0].support.type = supType; nodes[n].support.type = supType;
    if (o.kind === 'arch3') nodes[n / 2].hinge = true;
    const members = [];
    for (let i = 0; i < n; i++) members.push(addMember(model, nodes[i].id, nodes[i + 1].id, o.kind === 'cable' ? { I: 1e-9 } : {}));
    addLoads(members, nodes);
    model.meta = { kind: o.kind, span: L, rise: f, shape: o.shape, n };
    return model;
  }

  // ---- 範例 ----
  function build(fn) {
    const model = createEmpty();
    const N = (x, y, sup) => { const n = addNode(model, x, y); if (sup) n.support.type = sup; return n; };
    const M = (a, b, props) => addMember(model, a.id, b.id, props);
    fn({ model, N, M });
    return model;
  }
  const presets = [
    { name: '簡支梁＋中央集中力', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(6, 0, 'roller');
      M(a, b).loads.push(newPointLoad(3, 10));
    }) },
    { name: '簡支梁＋均布載重', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(6, 0, 'roller');
      M(a, b).loads.push(newUDL(0, 6, 5));
    }) },
    { name: '簡支梁＋三角形載重', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(6, 0, 'roller');
      const l = newUDL(0, 6, 6); l.w1 = 0; M(a, b).loads.push(l);
    }) },
    { name: '懸臂梁＋端點集中力', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'fixed'), b = N(4, 0);
      M(a, b); b.loads.fy = -10;
    }) },
    { name: '懸臂梁＋均布載重', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'fixed'), b = N(4, 0);
      M(a, b).loads.push(newUDL(0, 4, 5));
    }) },
    { name: '外伸梁＋均布載重', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(6, 0, 'roller'), c = N(8, 0);
      M(a, b).loads.push(newUDL(0, 6, 5));
      M(b, c).loads.push(newUDL(0, 2, 5));
    }) },
    { name: '簡支梁＋集中彎矩', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(6, 0, 'roller');
      M(a, b).loads.push(newMoment(2, 12));
    }) },
    { name: '固定梁＋均布載重（靜不定）', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'fixed'), b = N(6, 0, 'fixed');
      M(a, b).loads.push(newUDL(0, 6, 5));
    }) },
    { name: '一端固定一端滾支＋均布', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'fixed'), b = N(6, 0, 'roller');
      M(a, b).loads.push(newUDL(0, 6, 5));
    }) },
    { name: '兩跨連續梁（靜不定）', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(5, 0, 'roller'), c = N(10, 0, 'roller');
      M(a, b).loads.push(newUDL(0, 5, 5));
      M(b, c).loads.push(newUDL(0, 5, 5));
    }) },
    { name: 'Gerber 梁（內鉸）', group: '梁', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0, 'roller'), h = N(6, 0), c = N(10, 0, 'roller');
      h.hinge = true;
      M(a, b).loads.push(newUDL(0, 4, 5));
      M(b, h).loads.push(newUDL(0, 2, 5));
      M(h, c).loads.push(newPointLoad(2, 10));
    }) },
    { name: '三跨連續梁（活載重配置）', group: '靜不定行為', build: () => {
      const model = build(({ N, M }) => {
        const a = N(0, 0, 'pin'), b = N(6, 0, 'roller'), c = N(12, 0, 'roller'), d = N(18, 0, 'roller');
        M(a, b); M(b, c); M(c, d);
      });
      model.live = { wD: 5, wL: 10, pattern: [true, false, true], envelope: true };
      Analysis.setLivePattern(model, Analysis.continuousBeam(model), 5, 10, model.live.pattern);
      return model;
    } },
    { name: '沉陷比較：簡支梁 vs 兩跨連續梁', group: '靜不定行為', build: () => build(({ N, M }) => {
      const a = N(0, 3, 'pin'), b = N(6, 3), c = N(12, 3, 'roller');
      M(a, b); M(b, c); c.settle.dy = -0.02;
      const d = N(0, 0, 'pin'), e = N(6, 0, 'roller'), f = N(12, 0, 'roller');
      M(d, e); M(e, f); e.settle.dy = -0.02;
    }) },
    { name: '升溫比較：簡支梁 vs 固定梁', group: '靜不定行為', build: () => build(({ N, M }) => {
      const a = N(0, 3, 'pin'), b = N(6, 3, 'roller'); M(a, b).loads.push(newTemp(30));
      const c = N(0, 0, 'fixed'), d = N(6, 0, 'fixed'); M(c, d).loads.push(newTemp(30));
    }) },
    { name: '溫差（梯度）比較：簡支梁 vs 固定梁', group: '靜不定行為', build: () => build(({ N, M }) => {
      const a = N(0, 3, 'pin'), b = N(6, 3, 'roller'); M(a, b).loads.push(newTemp(0, 20, 0.5));
      const c = N(0, 0, 'fixed'), d = N(6, 0, 'fixed'); M(c, d).loads.push(newTemp(0, 20, 0.5));
    }) },
    { name: '三鉸剛架', group: '剛架', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(0, 4), c = N(4, 4), d = N(8, 4), e = N(8, 0, 'pin');
      c.hinge = true;
      M(a, b); M(b, c).loads.push(newUDL(0, 4, 5)); M(c, d).loads.push(newUDL(0, 4, 5)); M(d, e);
      b.loads.fx = 8;
    }) },
    { name: '門型剛架（固定端）', group: '剛架', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'fixed'), b = N(0, 4), c = N(6, 4), d = N(6, 0, 'fixed');
      M(a, b); M(b, c).loads.push(newUDL(0, 6, 5)); M(c, d);
      b.loads.fx = 10;
    }) },
    { name: '山形三鉸剛架＋均布', group: '剛架', build: () => generate({ kind: 'gable3', span: 12, rise: 2, height: 4, w: 5 }) },
    { name: '三鉸拋物線拱＋均布（純壓力）', group: '拱與纜索', build: () => generate({ kind: 'arch3', shape: 'parabola', span: 12, rise: 3, n: 12, w: 5, loadMode: 'projected' }) },
    { name: '三鉸拋物線拱＋頂點集中力', group: '拱與纜索', build: () => generate({ kind: 'arch3', shape: 'parabola', span: 12, rise: 3, n: 12, P: 20 }) },
    { name: '三鉸圓拱＋均布', group: '拱與纜索', build: () => generate({ kind: 'arch3', shape: 'circle', span: 12, rise: 3, n: 12, w: 5, loadMode: 'projected' }) },
    { name: '兩鉸拱＋均布（靜不定）', group: '拱與纜索', build: () => generate({ kind: 'arch2', shape: 'parabola', span: 12, rise: 3, n: 12, w: 5, loadMode: 'projected' }) },
    { name: '纜索＋均布（拱的倒置）', group: '拱與纜索', build: () => generate({ kind: 'cable', shape: 'parabola', span: 12, rise: 3, n: 12, w: 5 }) },
    { name: '簡單桁架（Warren）', group: '桁架', build: () => build(({ model, N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0), c = N(8, 0), d = N(12, 0, 'roller');
      const e = N(2, 3), f = N(6, 3), g = N(10, 3);
      const T = { truss: true };
      M(a, b, T); M(b, c, T); M(c, d, T); M(e, f, T); M(f, g, T);
      M(a, e, T); M(e, b, T); M(b, f, T); M(f, c, T); M(c, g, T); M(g, d, T);
      b.loads.fy = -10; c.loads.fy = -10;
    }) },
    { name: 'Pratt 桁架（含零桿）', group: '桁架', build: () => build(({ model, N, M }) => {
      model.settings.trussMode = true;
      const T = { truss: true };
      const b = [N(0, 0, 'pin'), N(4, 0), N(8, 0), N(12, 0), N(16, 0, 'roller')];
      const t = [N(0, 4), N(4, 4), N(8, 4), N(12, 4), N(16, 4)];
      for (let i = 0; i < 4; i++) { M(b[i], b[i + 1], T); M(t[i], t[i + 1], T); }
      for (let i = 0; i < 5; i++) M(b[i], t[i], T);
      M(t[0], b[1], T); M(t[1], b[2], T); M(b[2], t[3], T); M(b[3], t[4], T);
      b[1].loads.fy = -10; b[2].loads.fy = -10; b[3].loads.fy = -10;
    }) },
    { name: 'Howe 桁架＋上弦載重', group: '桁架', build: () => build(({ model, N, M }) => {
      model.settings.trussMode = true;
      const T = { truss: true };
      const b = [N(0, 0, 'pin'), N(3, 0), N(6, 0), N(9, 0), N(12, 0, 'roller')];
      const t = [N(3, 3), N(6, 3), N(9, 3)];
      for (let i = 0; i < 4; i++) M(b[i], b[i + 1], T);
      M(t[0], t[1], T); M(t[1], t[2], T);
      M(b[0], t[0], T); M(t[2], b[4], T);
      M(b[1], t[0], T); M(b[2], t[1], T); M(b[3], t[2], T);
      M(b[1], t[1], T); M(b[3], t[1], T);
      t[0].loads.fy = -10; t[1].loads.fy = -10; t[2].loads.fy = -10;
    }) },
    { name: '懸臂桁架（零桿練習）', group: '桁架', build: () => build(({ model, N, M }) => {
      model.settings.trussMode = true;
      const T = { truss: true };
      const a = N(0, 3, 'pin'), b = N(0, 0, 'pin'), c = N(3, 3), d = N(3, 0), e = N(6, 3), f = N(6, 0);
      M(a, c, T); M(c, e, T); M(b, d, T); M(d, f, T); M(c, d, T); M(e, f, T); M(a, d, T); M(c, f, T);
      f.loads.fy = -10;
    }) },
    { name: '不穩定：三個滾支承（反力線平行）', group: '判別', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'roller'), b = N(4, 0, 'roller'), c = N(8, 0, 'roller');
      M(a, b); M(b, c); b.loads.fy = -10;
    }) },
    { name: '幾何不穩定：三鉸共線（n = 0）', group: '判別', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), h = N(4, 0), b = N(8, 0, 'pin');
      h.hinge = true; M(a, h); M(h, b); h.loads.fy = -10;
    }) },
    { name: '幾何不穩定：反力線共點（n = 0）', group: '判別', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(6, 0, 'roller');
      b.support.angle = 90; // 滾支承面垂直 → 反力水平，通過鉸支承
      M(a, b).loads.push(newPointLoad(3, 10));
    }) },
    { name: '結構變更練習：簡支梁（記錄為 A 後加支承／內鉸）', group: '判別', build: () => build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0), c = N(8, 0, 'roller');
      M(a, b).loads.push(newUDL(0, 4, 5)); M(b, c).loads.push(newUDL(0, 4, 5));
    }) },
  ];

  return {
    DEFAULT_SETTINGS, createEmpty, newId, node, member, makeNode, findNodeAt, memberGeom,
    pointOnMember, findMemberAt, addNode, addMember, findMember, splitMember, removeMember, removeNode, moveNode,
    connectedMembers, newPointLoad, newUDL, newMoment, newTemp, serialize, deserialize, clone, presets, generate,
  };
})();
