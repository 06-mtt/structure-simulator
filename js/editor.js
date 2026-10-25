// 互動編輯器：畫布、工具、拖曳、繪製結構與載重
class Editor {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.app = app;
    this.view = { ox: 120, oy: 300, scale: 70 };
    this.tool = 'select';
    this.selection = null; // {type:'node'|'member'|'load', id, memberId, index}
    this.hover = null;
    this.drag = null;
    this.pending = null; // 桿件工具的起點
    this.mouse = null;
    this.spaceDown = false;
    this.bind();
    this.resize();
    new ResizeObserver(() => { this.resize(); this.draw(); }).observe(canvas);
  }
  get model() { return this.app.model; }
  get result() { return this.app.result; }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }
  toScreen(x, y) { return [this.view.ox + x * this.view.scale, this.view.oy - y * this.view.scale]; }
  toWorld(sx, sy) { return [(sx - this.view.ox) / this.view.scale, (this.view.oy - sy) / this.view.scale]; }
  snap(v) { const s = this.model.settings.snap || 0.5; return Math.round(v / s) * s; }

  fitView() {
    this.resize(); // 確保使用目前的畫布尺寸
    const nodes = this.model.nodes;
    if (!nodes.length) { this.view = { ox: 120, oy: this.h * 0.6, scale: 70 }; return; }
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const n of nodes) { xmin = Math.min(xmin, n.x); xmax = Math.max(xmax, n.x); ymin = Math.min(ymin, n.y); ymax = Math.max(ymax, n.y); }
    const w = Math.max(xmax - xmin, 1), h = Math.max(ymax - ymin, 1);
    const scale = Math.min((this.w - 200) / w, (this.h - 160) / h, 120);
    this.view.scale = Math.max(20, scale);
    this.view.ox = (this.w - (xmin + xmax) * this.view.scale) / 2;
    this.view.oy = (this.h + (ymin + ymax) * this.view.scale) / 2;
  }

  setTool(t) {
    this.tool = t; this.pending = null; this.drag = null;
    this.app.onToolChanged(t);
    this.draw();
  }
  select(sel) { this.selection = sel; this.app.onSelectionChanged(sel); this.draw(); }

  // ---- 事件 ----
  bind() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mouseup', e => this.onUp(e));
    c.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', e => { e.preventDefault(); if (this.pending) { this.pending = null; this.draw(); } });
    c.addEventListener('mouseleave', () => { this.hover = null; this.mouse = null; this.draw(); });
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { this.spaceDown = true; e.preventDefault(); }
      if (e.key === 'Escape') { this.pending = null; this.drag = null; if (this.tool !== 'select') this.setTool('select'); else this.select(null); }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelection(); }
    });
    window.addEventListener('keyup', e => { if (e.code === 'Space') this.spaceDown = false; });
  }
  pos(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  onWheel(e) {
    e.preventDefault();
    const [sx, sy] = this.pos(e);
    const [wx, wy] = this.toWorld(sx, sy);
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.view.scale = Math.min(400, Math.max(10, this.view.scale * f));
    this.view.ox = sx - wx * this.view.scale;
    this.view.oy = sy + wy * this.view.scale;
    this.app.redraw();
  }

  onDown(e) {
    const [sx, sy] = this.pos(e);
    this.mouse = [sx, sy];
    if (e.button === 1 || this.spaceDown || this.tool === 'pan' || e.button === 2) {
      if (e.button === 2) return;
      this.drag = { kind: 'pan', sx, sy, ox: this.view.ox, oy: this.view.oy };
      e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    let hit = this.hitTest(sx, sy);
    const [wx, wy] = this.toWorld(sx, sy);
    const gx = this.snap(wx), gy = this.snap(wy);
    const t = this.tool;
    if (this.model.settings.trussMode && (t === 'load-udl' || t === 'load-temp')) return; // 桁架模式不加桿件載重
    if (t === 'select') {
      if (hit) {
        this.select(hit);
        if (hit.type === 'node') this.drag = { kind: 'node', id: hit.id, moved: false };
        else if (hit.type === 'load') {
          const m = Model.member(this.model, hit.memberId), ld = m.loads[hit.index];
          if (ld.type === 'point' || ld.type === 'moment') this.drag = { kind: 'load', memberId: hit.memberId, index: hit.index, moved: false };
          else if (ld.type === 'udl') this.drag = { kind: 'udl', memberId: hit.memberId, index: hit.index, a: ld.a, b: ld.b, t0: this.alongMember(m, wx, wy), moved: false };
        }
      } else {
        this.select(null);
        this.drag = { kind: 'pan', sx, sy, ox: this.view.ox, oy: this.view.oy };
      }
    } else if (t === 'section') {
      this.drag = { kind: 'section', x1: wx, y1: wy, x2: wx, y2: wy };
    } else if (t === 'member') {
      let p;
      if (hit && hit.type === 'node') { const n = Model.node(this.model, hit.id); p = { x: n.x, y: n.y }; }
      else if (hit && hit.type === 'member') { const m = Model.member(this.model, hit.id); const q = this.snapOnMember(m, wx, wy); p = { x: q.x, y: q.y }; }
      else p = { x: gx, y: gy };
      if (!this.pending) { this.pending = p; this.draw(); return; }
      if (Math.abs(p.x - this.pending.x) < 1e-9 && Math.abs(p.y - this.pending.y) < 1e-9) return;
      const n1 = Model.addNode(this.model, this.pending.x, this.pending.y);
      const n2 = Model.addNode(this.model, p.x, p.y);
      Model.addMember(this.model, n1.id, n2.id, this.model.settings.trussMode ? { truss: true } : {});
      this.pending = e.shiftKey ? p : null;
      this.app.commit();
    } else if (t.startsWith('sup-')) {
      const nd = this.nodeFromHit(hit, wx, wy);
      if (!nd) return;
      const type = t.slice(4);
      nd.support.type = nd.support.type === type ? 'none' : type;
      if (type === 'spring' && nd.support.kx === 0 && nd.support.ky === 0 && nd.support.kr === 0) nd.support.ky = 1000;
      this.app.commit(); this.select({ type: 'node', id: nd.id });
    } else if (t === 'hinge') {
      const nd = this.nodeFromHit(hit, wx, wy);
      if (!nd) return;
      nd.hinge = !nd.hinge; this.app.commit(); this.select({ type: 'node', id: nd.id });
    } else if (t === 'load-point' || t === 'load-moment') {
      // 桁架模式：載重只加在節點，點到桿件時改加在最近的端點
      if (this.model.settings.trussMode && hit && hit.type === 'member') {
        const m = Model.member(this.model, hit.id);
        const a = Model.node(this.model, m.n1), b = Model.node(this.model, m.n2);
        const near = Math.hypot(a.x - wx, a.y - wy) <= Math.hypot(b.x - wx, b.y - wy) ? a : b;
        hit = { type: 'node', id: near.id };
      }
      if (hit && hit.type === 'node') {
        const nd = Model.node(this.model, hit.id);
        if (t === 'load-point') { if (nd.loads.fy === 0 && nd.loads.fx === 0) nd.loads.fy = -10; else { nd.loads.fx = 0; nd.loads.fy = 0; } }
        else nd.loads.m = nd.loads.m === 0 ? 10 : 0;
        this.app.commit(); this.select({ type: 'node', id: nd.id });
      } else if (hit && hit.type === 'member') {
        const m = Model.member(this.model, hit.id);
        const q = this.snapOnMember(m, wx, wy);
        m.loads.push(t === 'load-point' ? Model.newPointLoad(q.t) : Model.newMoment(q.t));
        this.app.commit(); this.select({ type: 'load', memberId: m.id, index: m.loads.length - 1 });
      }
    } else if (t === 'load-udl') {
      if (hit && hit.type === 'member') {
        const m = Model.member(this.model, hit.id);
        const q = this.snapOnMember(m, wx, wy);
        this.drag = { kind: 'newudl', memberId: m.id, a: q.t, b: q.t };
      }
    } else if (t === 'load-temp') {
      if (hit && hit.type === 'member') {
        const m = Model.member(this.model, hit.id);
        const ex = m.loads.findIndex(l => l.type === 'temp');
        if (ex >= 0) m.loads.splice(ex, 1); else m.loads.push(Model.newTemp());
        this.app.commit(); this.select({ type: 'member', id: m.id });
      }
    } else if (t === 'delete') {
      if (hit) { this.selection = hit; this.deleteSelection(); }
    }
  }

  nodeFromHit(hit, wx, wy) {
    if (hit && hit.type === 'node') return Model.node(this.model, hit.id);
    if (hit && hit.type === 'member') {
      const m = Model.member(this.model, hit.id);
      const q = this.snapOnMember(m, wx, wy);
      return Model.addNode(this.model, q.x, q.y); // 自動分割桿件
    }
    return null;
  }
  alongMember(m, wx, wy) {
    const g = Model.memberGeom(this.model, m);
    return Math.min(Math.max((wx - g.x1) * g.c + (wy - g.y1) * g.s, 0), g.L);
  }
  snapOnMember(m, wx, wy) {
    const g = Model.memberGeom(this.model, m);
    let t = this.alongMember(m, wx, wy);
    t = Math.min(Math.max(this.snap(t), 0), g.L);
    return { t, x: g.x1 + g.c * t, y: g.y1 + g.s * t };
  }

  onMove(e) {
    const [sx, sy] = this.pos(e);
    this.mouse = [sx, sy];
    const [wx, wy] = this.toWorld(sx, sy);
    const d = this.drag;
    if (d) {
      if (d.kind === 'pan') { this.view.ox = d.ox + (sx - d.sx); this.view.oy = d.oy + (sy - d.sy); this.app.redraw(); return; }
      if (d.kind === 'node') {
        const nd = Model.node(this.model, d.id);
        const gx = this.snap(wx), gy = this.snap(wy);
        if (Math.abs(gx - nd.x) > 1e-9 || Math.abs(gy - nd.y) > 1e-9) { if (Model.moveNode(this.model, nd, gx, gy)) { d.moved = true; this.app.recompute(false); } }
        return;
      }
      if (d.kind === 'load') {
        const m = Model.member(this.model, d.memberId); const ld = m.loads[d.index];
        const q = this.snapOnMember(m, wx, wy);
        if (Math.abs(q.t - ld.pos) > 1e-9) { ld.pos = q.t; d.moved = true; this.app.recompute(false); }
        return;
      }
      if (d.kind === 'udl') {
        const m = Model.member(this.model, d.memberId); const ld = m.loads[d.index];
        const g = Model.memberGeom(this.model, m);
        const t = this.alongMember(m, wx, wy);
        let shift = this.snap(t - d.t0);
        shift = Math.max(-d.a, Math.min(g.L - d.b, shift));
        if (Math.abs(d.a + shift - ld.a) > 1e-9) { ld.a = d.a + shift; ld.b = d.b + shift; d.moved = true; this.app.recompute(false); }
        return;
      }
      if (d.kind === 'newudl') {
        const m = Model.member(this.model, d.memberId);
        d.b = this.snapOnMember(m, wx, wy).t; this.draw(); return;
      }
      if (d.kind === 'section') { d.x2 = wx; d.y2 = wy; this.draw(); return; }
    }
    const h = this.hitTest(sx, sy);
    const changed = JSON.stringify(h) !== JSON.stringify(this.hover);
    this.hover = h;
    if (changed || this.tool === 'member') this.draw();
    this.app.onHover(h, wx, wy);
  }

  onUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.kind === 'section') {
      if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 1e-6) return;
      this.app.setSection({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, side: 'L' });
      return;
    }
    if (d.kind === 'newudl') {
      const m = Model.member(this.model, d.memberId);
      const g = Model.memberGeom(this.model, m);
      let a = Math.min(d.a, d.b), b = Math.max(d.a, d.b);
      if (b - a < 1e-9) { a = 0; b = g.L; }
      m.loads.push(Model.newUDL(a, b));
      this.app.commit(); this.select({ type: 'load', memberId: m.id, index: m.loads.length - 1 });
    } else if ((d.kind === 'node' || d.kind === 'load' || d.kind === 'udl') && d.moved) {
      this.app.commit();
    }
  }

  deleteSelection() {
    const s = this.selection;
    if (!s) return;
    if (s.type === 'node') Model.removeNode(this.model, s.id);
    else if (s.type === 'member') Model.removeMember(this.model, s.id);
    else if (s.type === 'load') { const m = Model.member(this.model, s.memberId); if (m) m.loads.splice(s.index, 1); }
    this.selection = null;
    this.app.commit(); this.app.onSelectionChanged(null);
  }

  // ---- 命中測試 ----
  hitTest(sx, sy) {
    const model = this.model;
    for (const n of model.nodes) {
      const [x, y] = this.toScreen(n.x, n.y);
      if (Math.hypot(x - sx, y - sy) <= 9) return { type: 'node', id: n.id };
    }
    // 載重
    for (const m of model.members) {
      const shapes = this.loadShapes(m);
      for (const sh of shapes) {
        if (sh.kind === 'seg' && distToSeg(sx, sy, sh.x1, sh.y1, sh.x2, sh.y2) <= 6) return { type: 'load', memberId: m.id, index: sh.index };
        if (sh.kind === 'circle' && Math.abs(Math.hypot(sx - sh.x, sy - sh.y) - sh.r) <= 6) return { type: 'load', memberId: m.id, index: sh.index };
        if (sh.kind === 'poly' && pointInPoly(sx, sy, sh.pts)) return { type: 'load', memberId: m.id, index: sh.index };
      }
    }
    for (const m of model.members) {
      const a = Model.node(model, m.n1), b = Model.node(model, m.n2);
      const [x1, y1] = this.toScreen(a.x, a.y), [x2, y2] = this.toScreen(b.x, b.y);
      if (distToSeg(sx, sy, x1, y1, x2, y2) <= 6) return { type: 'member', id: m.id };
    }
    return null;
  }

  // 載重在畫面上的幾何（供繪製與命中）
  loadShapes(m) {
    const model = this.model;
    const g = Model.memberGeom(model, m);
    const out = [];
    const S = this.view.scale;
    const perpX = -g.s, perpY = g.c; // 局部 +y（世界）
    const prevUdl = []; // 已畫的分布載重：重疊範圍時往外堆疊
    m.loads.forEach((ld, index) => {
      if (ld.type === 'point') {
        const [x, y] = this.toScreen(g.x1 + g.c * ld.pos, g.y1 + g.s * ld.pos);
        const th = -ld.angle * Math.PI / 180, len = 44;
        out.push({ kind: 'seg', index, x1: x - Math.cos(th) * len, y1: y - Math.sin(th) * len, x2: x, y2: y, x, y, ld });
      } else if (ld.type === 'moment') {
        const [x, y] = this.toScreen(g.x1 + g.c * ld.pos, g.y1 + g.s * ld.pos);
        out.push({ kind: 'circle', index, x, y, r: 16, ld });
      } else if (ld.type === 'udl') {
        const [ax, ay] = this.toScreen(g.x1 + g.c * ld.a, g.y1 + g.s * ld.a);
        const [bx, by] = this.toScreen(g.x1 + g.c * ld.b, g.y1 + g.s * ld.b);
        let dx, dy; // 力方向（畫面）
        if (ld.dir === 'local') { dx = perpX * -1; dy = -(perpY * -1); } else { dx = 0; dy = 1; }
        // 畫面座標 y 向下：世界向量 (vx,vy) → 畫面 (vx,-vy)
        if (ld.dir === 'local') { dx = -perpX; dy = perpY; }
        const wmax = Math.max(Math.abs(ld.w1), Math.abs(ld.w2), 1e-9);
        const hmax = 36;
        const h1 = hmax * ld.w1 / wmax, h2 = hmax * ld.w2 / wmax;
        let off = 0;
        for (const p of prevUdl) if (p.a < ld.b - 1e-9 && p.b > ld.a + 1e-9 && p.dx === dx && p.dy === dy) off += p.h + 4;
        prevUdl.push({ a: ld.a, b: ld.b, h: Math.max(h1, h2), dx, dy });
        const [ax2, ay2, bx2, by2] = [ax - dx * off, ay - dy * off, bx - dx * off, by - dy * off];
        const pts = [[ax2, ay2], [bx2, by2], [bx2 - dx * h2, by2 - dy * h2], [ax2 - dx * h1, ay2 - dy * h1]];
        out.push({ kind: 'poly', index, pts, ax: ax2, ay: ay2, bx: bx2, by: by2, dx, dy, h1, h2, ld });
      }
    });
    return out;
  }

  // ---- 繪製 ----
  draw() {
    const ctx = this.ctx, model = this.model, res = this.result;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawGrid(ctx);
    const S = this.view.scale;
    const F = model.settings.forceUnit, Lu = model.settings.lengthUnit;
    const fmt = Analysis.fmt;
    // 機構模態（不穩定）：動畫
    if (res && res.unstable && res.mechanisms && !this.app.hidden('det')) {
      const idx = Math.min(this.app.mechIndex || 0, res.mechanisms.length - 1);
      this.drawMechanism(ctx, res.mechanisms[idx], idx, res.mechanisms.length);
      this.startAnim();
    }
    // 桁架內力著色
    const trussView = res && res.ok && res.classification.allTruss && model.settings.showTrussForces && !this.app.hidden('truss');
    const sec = this.app.quiz.on && !this.app.quiz.revealed ? null : this.app.sectionResult;
    const tolN = res && res.ok ? 1e-8 * Math.max(1, res.maxAbsN) : 0;
    // 桿件
    for (const m of model.members) {
      const a = Model.node(model, m.n1), b = Model.node(model, m.n2);
      const [x1, y1] = this.toScreen(a.x, a.y), [x2, y2] = this.toScreen(b.x, b.y);
      const sel = this.selection && this.selection.type === 'member' && this.selection.id === m.id;
      const hov = this.hover && this.hover.type === 'member' && this.hover.id === m.id;
      let N = null, zero = false;
      if (trussView && res.members[m.id]) { N = res.members[m.id].fns.at(res.members[m.id].geom.L / 2).N; zero = Math.abs(N) < tolN; }
      ctx.save();
      let color = sel ? Draw.COLORS.select : hov ? Draw.COLORS.hover : (m.truss ? Draw.COLORS.truss : Draw.COLORS.member);
      if (N !== null && !sel && !hov) color = zero ? '#9ca3af' : N > 0 ? Draw.COLORS.Vp : Draw.COLORS.Vn;
      // 截面法：非取用側淡化
      if (sec && !sec.partNodes.has(m.n1) && !sec.partNodes.has(m.n2)) ctx.globalAlpha = 0.25;
      ctx.strokeStyle = color;
      ctx.lineWidth = m.truss ? 3 : 4.5;
      ctx.lineCap = 'round';
      if (zero) ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (m.truss && !zero) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      ctx.restore();
      if (N !== null) {
        const g0 = Model.memberGeom(model, m);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, off = 12;
        let txt = zero ? '0' : `${fmt(Math.abs(N))} ${N > 0 ? 'T' : 'C'}`;
        const z = res.zero && res.zero.found[m.id];
        if (zero && z) txt += ` ${['', '①', '②', '③'][z.rule] || ''}`;
        Draw.label(ctx, txt, mx - g0.s * off, my - g0.c * off, { color: zero ? '#6b7280' : N > 0 ? Draw.COLORS.Vp : Draw.COLORS.Vn, font: 'bold 11px system-ui, sans-serif' });
      }
      // 桿端釋放（手動）
      const rel = res && res.releases ? res.releases[m.id] : [m.release1 || m.truss, m.release2 || m.truss];
      const g = Model.memberGeom(model, m);
      if (!m.truss) {
        if (m.release1 && !a.hinge) Draw.hinge(ctx, x1 + g.c * 10, y1 - g.s * 10, 4);
        if (m.release2 && !b.hinge) Draw.hinge(ctx, x2 - g.c * 10, y2 + g.s * 10, 4);
      }
      // 尺寸
      if (model.settings.showDims && !trussView) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const off = 16;
        Draw.label(ctx, `${fmt(g.L)} ${Lu}`, mx + g.s * off * 0.9, my + g.c * off, { color: Draw.COLORS.dim, font: '11px system-ui, sans-serif' });
      }
      // 桿件載重（桿件在畫面上很短時省略文字）
      const shortMember = Math.hypot(x2 - x1, y2 - y1) < 70;
      for (const sh of this.loadShapes(m)) {
        const selL = this.selection && this.selection.type === 'load' && this.selection.memberId === m.id && this.selection.index === sh.index;
        const hovL = this.hover && this.hover.type === 'load' && this.hover.memberId === m.id && this.hover.index === sh.index;
        const col = selL ? Draw.COLORS.select : hovL ? Draw.COLORS.hover : (sh.ld.type === 'moment' ? Draw.COLORS.moment : Draw.COLORS.load);
        if (sh.kind === 'seg') {
          Draw.pointLoad(ctx, sh.x, sh.y, sh.ld.angle, 44, col, `${fmt(sh.ld.P)} ${F}`);
        } else if (sh.kind === 'circle') {
          Draw.momentArrow(ctx, sh.x, sh.y, sh.r, sh.ld.M >= 0, col);
          Draw.label(ctx, `${fmt(Math.abs(sh.ld.M))} ${F}·${Lu}`, sh.x, sh.y - sh.r - 12, { color: col });
        } else if (sh.kind === 'poly') {
          const w1 = sh.ld.w1, w2 = sh.ld.w2;
          const txt = (Math.abs(w1 - w2) < 1e-9 ? `${fmt(w1)} ${F}/${Lu}` : `${fmt(w1)}→${fmt(w2)} ${F}/${Lu}`) + (sh.ld.tag === 'live' ? '（活）' : sh.ld.tag === 'dead' ? '（靜）' : '');
          Draw.distLoad(ctx, sh.ax, sh.ay, sh.bx, sh.by, sh.dx, sh.dy, sh.h1, sh.h2, col, shortMember ? null : txt + (sh.ld.dir === 'local' ? '（垂直桿軸）' : sh.ld.dir === 'projected' ? '（投影）' : ''));
        }
      }
      const tempLd = m.loads.find(l => l.type === 'temp');
      if (tempLd) Draw.label(ctx, `ΔT = ${fmt(tempLd.dT)}°C`, (x1 + x2) / 2 - g.s * 18, (y1 + y2) / 2 - g.c * 18, { color: '#b45309' });
    }
    // 節點
    for (const n of model.nodes) {
      const [x, y] = this.toScreen(n.x, n.y);
      const sel = this.selection && this.selection.type === 'node' && this.selection.id === n.id;
      const hov = this.hover && this.hover.type === 'node' && this.hover.id === n.id;
      const away = this.awayDir(n);
      Draw.support(ctx, n.support.type, x, y, n.support.angle, away);
      if (n.hinge) Draw.hinge(ctx, x, y, 5.5);
      else Draw.node(ctx, x, y, 4, sel ? Draw.COLORS.select : hov ? Draw.COLORS.hover : Draw.COLORS.node);
      if (sel || hov) { ctx.save(); ctx.strokeStyle = sel ? Draw.COLORS.select : Draw.COLORS.hover; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); }
      // 節點載重
      const nl = n.loads;
      if (nl.fx || nl.fy) {
        const P = Math.hypot(nl.fx, nl.fy), ang = Math.atan2(nl.fy, nl.fx) * 180 / Math.PI;
        Draw.pointLoad(ctx, x, y, ang, 48, Draw.COLORS.nodal, `${fmt(P)} ${F}`);
      }
      if (nl.m) { Draw.momentArrow(ctx, x, y, 18, nl.m > 0, Draw.COLORS.moment); Draw.label(ctx, `${fmt(Math.abs(nl.m))} ${F}·${Lu}`, x + 22, y - 20, { color: Draw.COLORS.moment }); }
      // 沉陷
      if (n.support.type !== 'none' && (n.settle.dx || n.settle.dy || n.settle.rz)) Draw.label(ctx, `沉陷 (${fmt(n.settle.dx)}, ${fmt(n.settle.dy)})`, x, y + 42, { color: '#b45309', font: '11px system-ui, sans-serif' });
      // 節點編號
      Draw.label(ctx, String(n.id), x - 12, y - 12, { color: '#9ca3af', font: '10px system-ui, sans-serif', bg: null });
    }
    // 反力
    if (res && res.ok && model.settings.showReactions && !this.app.hidden('reactions')) this.drawReactions(ctx, res);
    if (this.app.quiz.on && !this.app.quiz.revealed) Draw.label(ctx, '測驗模式：答案已隱藏，作答後按「揭曉答案」', this.w / 2, 16, { color: '#4338ca', font: 'bold 13px system-ui, sans-serif' });
    if (trussView) Draw.label(ctx, '桁架內力：藍 T = 拉力、紅 C = 壓力、灰虛線 = 零桿（①②③ = 判定法則）', 12, 16, { color: '#374151', align: 'left', font: '11px system-ui, sans-serif' });
    // 截面法切割線與自由體
    if (sec) this.drawSection(ctx, sec, this.app.section);
    if (this.drag && this.drag.kind === 'section') {
      const [ax, ay] = this.toScreen(this.drag.x1, this.drag.y1), [bx, by] = this.toScreen(this.drag.x2, this.drag.y2);
      ctx.save(); ctx.strokeStyle = Draw.COLORS.moment; ctx.setLineDash([8, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
    }
    // 疊加變形
    if (res && res.ok && model.settings.showDeformed && res.maxDisp > 1e-15 && !this.app.hidden('D')) {
      const k = 40 / res.maxDisp * (model.settings.deformScale || 1);
      Draw.deformed(ctx, res, (x, y) => this.toScreen(x, y), k, { width: 2.4, dash: [7, 4] });
      Draw.label(ctx, `變形曲線（放大倍率 ${Analysis.fmt(model.settings.deformScale || 1)}×自動；綠 M>0、橙 M<0）`, this.w - 12, 16, { color: Draw.COLORS.D, align: 'right', font: '11px system-ui, sans-serif' });
    }
    // 桿件工具的橡皮筋
    if (this.tool === 'member' && this.pending && this.mouse) {
      const [x1, y1] = this.toScreen(this.pending.x, this.pending.y);
      const [wx, wy] = this.toWorld(this.mouse[0], this.mouse[1]);
      const [x2, y2] = this.toScreen(this.snap(wx), this.snap(wy));
      ctx.save(); ctx.strokeStyle = Draw.COLORS.select; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
      Draw.node(ctx, x1, y1, 5, Draw.COLORS.select);
      const [wx2, wy2] = this.toWorld(x2, y2);
      Draw.label(ctx, `L = ${fmt(Math.hypot(this.snap(wx) - this.pending.x, this.snap(wy) - this.pending.y))} ${Lu}`, x2 + 14, y2 - 14, { color: Draw.COLORS.select });
    } else if (this.tool === 'member' && this.mouse) {
      const [wx, wy] = this.toWorld(this.mouse[0], this.mouse[1]);
      const [x, y] = this.toScreen(this.snap(wx), this.snap(wy));
      ctx.save(); ctx.strokeStyle = Draw.COLORS.select; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    }
    // 新增均布載重的拖曳預覽
    if (this.drag && this.drag.kind === 'newudl') {
      const m = Model.member(model, this.drag.memberId); const g = Model.memberGeom(model, m);
      const a = Math.min(this.drag.a, this.drag.b), b = Math.max(this.drag.a, this.drag.b);
      const [ax, ay] = this.toScreen(g.x1 + g.c * a, g.y1 + g.s * a), [bx, by] = this.toScreen(g.x1 + g.c * b, g.y1 + g.s * b);
      Draw.distLoad(ctx, ax, ay, bx, by, 0, 1, 30, 30, Draw.COLORS.hover, b - a > 1e-9 ? `${fmt(a)} ~ ${fmt(b)}` : '放開 = 全長');
    }
  }

  awayDir(n) {
    const ms = Model.connectedMembers(this.model, n.id);
    if (!ms.length) return null;
    let vx = 0, vy = 0;
    for (const m of ms) {
      const o = Model.node(this.model, m.n1 === n.id ? m.n2 : m.n1);
      const d = Math.hypot(o.x - n.x, o.y - n.y) || 1;
      vx += (o.x - n.x) / d; vy += (o.y - n.y) / d;
    }
    const L = Math.hypot(vx, vy);
    if (L < 1e-6) return null;
    return { x: -vx / L, y: vy / L }; // 轉為畫面方向（y 向下）
  }

  drawGrid(ctx) {
    const { ox, oy, scale } = this.view;
    const snap = this.model.settings.snap || 0.5;
    let step = snap;
    while (step * scale < 12) step *= 2;
    ctx.save();
    const x0 = Math.floor(-ox / scale / step) * step, x1 = Math.ceil((this.w - ox) / scale / step) * step;
    const y0 = Math.floor((oy - this.h) / scale / step) * step, y1 = Math.ceil(oy / scale / step) * step;
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x += step) {
      const major = Math.abs(x / 1 - Math.round(x)) < 1e-9;
      ctx.strokeStyle = major ? Draw.COLORS.gridMajor : Draw.COLORS.grid;
      const sx = Math.round(ox + x * scale) + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, this.h); ctx.stroke();
    }
    for (let y = y0; y <= y1; y += step) {
      const major = Math.abs(y - Math.round(y)) < 1e-9;
      ctx.strokeStyle = major ? Draw.COLORS.gridMajor : Draw.COLORS.grid;
      const sy = Math.round(oy - y * scale) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(this.w, sy); ctx.stroke();
    }
    ctx.strokeStyle = Draw.COLORS.axis; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, Math.round(oy) + 0.5); ctx.lineTo(this.w, Math.round(oy) + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(Math.round(ox) + 0.5, 0); ctx.lineTo(Math.round(ox) + 0.5, this.h); ctx.stroke();
    // 座標刻度
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    const lstep = step * scale < 40 ? step * Math.ceil(40 / (step * scale)) : step;
    for (let x = Math.ceil(x0 / lstep) * lstep; x <= x1; x += lstep) ctx.fillText(Analysis.fmt(x), ox + x * scale, this.h - 4);
    ctx.textAlign = 'left';
    for (let y = Math.ceil(y0 / lstep) * lstep; y <= y1; y += lstep) if (Math.abs(y) > 1e-9) ctx.fillText(Analysis.fmt(y), 4, oy - y * scale - 3);
    ctx.restore();
  }

  drawReactions(ctx, res) {
    const fmt = Analysis.fmt, F = this.model.settings.forceUnit, Lu = this.model.settings.lengthUnit;
    for (const id in res.reactions) {
      const r = res.reactions[id]; const n = Model.node(this.model, +id);
      const [x, y] = this.toScreen(n.x, n.y);
      const col = Draw.COLORS.reaction;
      const items = [];
      if (Math.abs(r.fx) > 1e-9 || (r.type === 'pin' || r.type === 'fixed')) items.push(['fx', r.fx]);
      if (Math.abs(r.fy) > 1e-9 || r.type !== 'none') items.push(['fy', r.fy]);
      if (Math.abs(r.m) > 1e-9) items.push(['m', r.m]);
      // 斜向支承：以合力方向畫
      if (Math.abs(n.support.angle) > 1e-9 && r.type !== 'fixed') {
        const mag = Math.hypot(r.fx, r.fy);
        if (mag > 1e-9) { const ang = Math.atan2(r.fy, r.fx) * 180 / Math.PI; const th = -ang * Math.PI / 180; Draw.arrow(ctx, x - Math.cos(th) * 70, y - Math.sin(th) * 70, x - Math.cos(th) * 26, y - Math.sin(th) * 26, col, 9, 2.2); Draw.label(ctx, `R = ${fmt(mag)} ${F}`, x - Math.cos(th) * 84, y - Math.sin(th) * 84, { color: col }); }
        if (Math.abs(r.m) > 1e-9) { Draw.momentArrow(ctx, x, y, 24, r.m > 0, col); Draw.label(ctx, `${fmt(Math.abs(r.m))} ${F}·${Lu}`, x + 30, y + 26, { color: col }); }
        continue;
      }
      if (Math.abs(r.fy) > 1e-9) {
        const up = r.fy > 0;
        const y1 = up ? y + 90 : y - 90 + 60, y2 = up ? y + 30 : y - 30 + 60;
        // 反力箭頭畫在支承下方，指向反力方向
        if (up) Draw.arrow(ctx, x, y + 92, x, y + 34, col, 9, 2.2);
        else Draw.arrow(ctx, x, y + 34, x, y + 92, col, 9, 2.2);
        Draw.label(ctx, `${fmt(Math.abs(r.fy))} ${F}${up ? ' ↑' : ' ↓'}`, x, y + 104, { color: col });
      }
      if (Math.abs(r.fx) > 1e-9) {
        const right = r.fx > 0;
        if (right) Draw.arrow(ctx, x - 80, y + 18, x - 24, y + 18, col, 9, 2.2);
        else Draw.arrow(ctx, x + 80, y + 18, x + 24, y + 18, col, 9, 2.2);
        Draw.label(ctx, `${fmt(Math.abs(r.fx))} ${F}${right ? ' →' : ' ←'}`, right ? x - 92 : x + 92, y + 18, { color: col, align: right ? 'right' : 'left' });
      }
      if (Math.abs(r.m) > 1e-9) {
        Draw.momentArrow(ctx, x, y, 24, r.m > 0, col);
        Draw.label(ctx, `${fmt(Math.abs(r.m))} ${F}·${Lu} ${r.m > 0 ? '↺' : '↻'}`, x + 30, y - 26, { color: col, align: 'left' });
      }
    }
  }

  drawSection(ctx, sec, line) {
    const fmt = Analysis.fmt, F = this.model.settings.forceUnit;
    // 無限延伸的切割線
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, big = 1e4;
    const [ax, ay] = this.toScreen(line.x1 - ux * big, line.y1 - uy * big), [bx, by] = this.toScreen(line.x1 + ux * big, line.y1 + uy * big);
    ctx.save();
    ctx.strokeStyle = Draw.COLORS.moment; ctx.setLineDash([8, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
    // 切割桿件內力箭頭（作用在取用側自由體上）
    for (const c of sec.cut) {
      const [qx, qy] = this.toScreen(c.q[0], c.q[1]);
      const sx = c.u[0], sy = -c.u[1]; // 畫面方向（指向另一側）
      const len = 42;
      const col = Math.abs(c.N) < 1e-9 ? '#6b7280' : c.N > 0 ? Draw.COLORS.Vp : Draw.COLORS.Vn;
      if (c.N > 1e-9) Draw.arrow(ctx, qx, qy, qx + sx * len, qy + sy * len, col, 9, 2.4);          // 拉力：拉離自由體
      else if (c.N < -1e-9) Draw.arrow(ctx, qx + sx * len, qy + sy * len, qx, qy, col, 9, 2.4);    // 壓力：壓向自由體
      Draw.label(ctx, `N${c.id} = ${fmt(Math.abs(c.N))} ${F}${c.N > 1e-9 ? ' (T)' : c.N < -1e-9 ? ' (C)' : ''}`, qx + sx * (len + 8) - sy * 12, qy + sy * (len + 8) + sx * 12, { color: col, font: 'bold 11px system-ui, sans-serif' });
    }
    // 取矩中心
    const seen = new Set();
    for (const s of sec.suggestions) {
      if (!s.P) continue;
      const key = s.P.map(v => v.toFixed(6)).join(',');
      if (seen.has(key)) continue; seen.add(key);
      const [px, py] = this.toScreen(s.P[0], s.P[1]);
      ctx.save(); ctx.strokeStyle = Draw.COLORS.moment; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px - 6, py + 6); ctx.lineTo(px + 6, py - 6); ctx.stroke(); ctx.restore();
      Draw.label(ctx, `P（求桿 ${s.member}）`, px + 10, py - 10, { color: Draw.COLORS.moment, align: 'left', font: '10px system-ui, sans-serif' });
    }
    Draw.label(ctx, `截面法：取${sec.partLabel}為自由體（淡化者為捨去側），切到 ${sec.cut.length} 根桿件`, 12, 34, { color: Draw.COLORS.moment, align: 'left', font: '11px system-ui, sans-serif' });
  }

  startAnim() {
    if (this.animId) return;
    const step = t => {
      this.animT = t / 1000;
      if (this.result && this.result.unstable && !this.model.settings.noAnim) { this.draw(); this.animId = requestAnimationFrame(step); }
      else this.animId = null;
    };
    this.animId = requestAnimationFrame(step);
  }

  drawMechanism(ctx, mech, which = 0, total = 1) {
    const model = this.model;
    let mx = 0;
    model.nodes.forEach((n, i) => { mx = Math.max(mx, Math.hypot(mech[i].ux, mech[i].uy), Math.abs(mech[i].rz) * 2); });
    const amp = model.settings.noAnim ? 1 : Math.sin((this.animT || 0) * 2 * Math.PI / 2.4);
    const k = mx > 1e-12 ? 40 / mx * amp : 0;
    const idx = new Map(); model.nodes.forEach((n, i) => idx.set(n.id, i));
    ctx.save(); ctx.strokeStyle = Draw.COLORS.mech; ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const m of model.members) {
      const a = Model.node(model, m.n1), b = Model.node(model, m.n2);
      const da = mech[idx.get(a.id)], db = mech[idx.get(b.id)];
      const [x1, y1] = this.toScreen(a.x, a.y), [x2, y2] = this.toScreen(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(x1 + da.ux * k, y1 - da.uy * k); ctx.lineTo(x2 + db.ux * k, y2 - db.uy * k); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of model.nodes) {
      const d = mech[idx.get(n.id)];
      if (!d) continue;
      const [x, y] = this.toScreen(n.x, n.y);
      const sx = x + d.ux * k, sy = y - d.uy * k;
      if (n.hinge) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = Draw.COLORS.mech; ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 2 * Math.PI); ctx.fill(); }
      // 運動方向箭頭（最大位移處）
      const mag = Math.hypot(d.ux, d.uy);
      if (mag > 0.3 * mx && mx > 1e-12) {
        const ux = d.ux / mag, uy = d.uy / mag;
        Draw.arrow(ctx, x - ux * 14, y + uy * 14, x + ux * 30, y - uy * 30, Draw.COLORS.mech, 8, 1.6);
        Draw.arrow(ctx, x + ux * 14, y - uy * 14, x - ux * 30, y + uy * 30, Draw.COLORS.mech, 8, 1.6);
      }
    }
    ctx.restore();
    Draw.label(ctx, `不穩定：紅色虛線為機構運動形狀（機構 ${which + 1}/${total}，動畫放大顯示）`, 12, 16, { color: Draw.COLORS.mech, align: 'left', font: 'bold 13px system-ui, sans-serif' });
  }
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
