// 內力圖與變形圖面板：與主畫布共用同一視圖座標，使圖形對齊結構
class Diagrams {
  constructor(container, app) {
    this.app = app;
    this.container = container;
    this.panels = [];
    const defs = [
      { kind: 'N', title: '軸力圖 AFD', visible: false },
      { kind: 'V', title: '剪力圖 SFD', visible: true },
      { kind: 'M', title: '彎矩圖 BMD', visible: true },
      { kind: 'D', title: '變形曲線', visible: true },
    ];
    for (const d of defs) {
      const wrap = document.createElement('div');
      wrap.className = 'diagram' + (d.visible ? '' : ' hidden');
      wrap.innerHTML = `<div class="diagram-head"><label><input type="checkbox" ${d.visible ? 'checked' : ''}> ${d.title}</label><span class="diagram-info"></span></div><canvas></canvas>`;
      container.appendChild(wrap);
      const canvas = wrap.querySelector('canvas');
      const p = { ...d, wrap, canvas, ctx: canvas.getContext('2d'), info: wrap.querySelector('.diagram-info') };
      wrap.querySelector('input').addEventListener('change', e => { p.visible = e.target.checked; wrap.classList.toggle('hidden', !p.visible); this.draw(); });
      this.panels.push(p);
    }
    new ResizeObserver(() => this.draw()).observe(container);
  }
  get model() { return this.app.model; }
  get editor() { return this.app.editor; }
  setVisible(kind, visible) {
    const p = this.panels.find(q => q.kind === kind);
    if (!p || p.visible === visible) return;
    p.visible = visible; p.wrap.classList.toggle('hidden', !visible); p.wrap.querySelector('input').checked = visible;
  }

  resize(p) {
    const dpr = window.devicePixelRatio || 1;
    const r = p.canvas.getBoundingClientRect();
    p.canvas.width = Math.max(1, Math.round(r.width * dpr));
    p.canvas.height = Math.max(1, Math.round(r.height * dpr));
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.w = r.width; p.h = r.height;
  }

  draw() {
    const res = this.app.result;
    // 非水平結構時加高面板，避免圖形被壓扁
    const ys = this.model.nodes.map(n => n.y);
    const yspan = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    const hpx = yspan < 1e-9 ? 150 : Math.min(380, Math.max(150, yspan * this.editor.view.scale + 100));
    for (const p of this.panels) {
      if (!p.visible) continue;
      p.canvas.style.height = hpx + 'px';
      this.resize(p);
      const ctx = p.ctx;
      ctx.clearRect(0, 0, p.w, p.h);
      this.drawOutline(p);
      if (this.app.hidden(p.kind)) { p.info.textContent = '測驗中（已隱藏）'; ctx.save(); ctx.fillStyle = '#4338ca'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('？', p.w / 2, p.h / 2 + 6); ctx.restore(); continue; }
      if (!res || !res.ok) { p.info.textContent = res && res.unstable && !this.app.hidden('det') ? '結構不穩定' : ''; continue; }
      if (p.kind === 'D') this.drawDeflection(p, res); else this.drawForce(p, res);
    }
  }

  // 主畫布的視圖，但垂直位置改用面板中央（水平梁時圖形落在面板中間）
  mapper(p) {
    const v = this.editor.view;
    const nodes = this.model.nodes;
    let ymid = 0;
    if (nodes.length) { let a = Infinity, b = -Infinity; for (const n of nodes) { a = Math.min(a, n.y); b = Math.max(b, n.y); } ymid = (a + b) / 2; }
    const yspan = nodes.length ? Math.max(...nodes.map(n => n.y)) - Math.min(...nodes.map(n => n.y)) : 0;
    // 若為水平結構，置中；否則依主畫布比例縮放以塞進面板
    let scale = v.scale;
    if (yspan * scale > p.h - 90) scale = Math.max(5, (p.h - 90) / Math.max(yspan, 1e-9));
    const oy = p.h / 2 + ymid * scale;
    const ox = v.ox + (nodes.length ? 0 : 0);
    const ox2 = scale === v.scale ? v.ox : (() => { const xs = nodes.map(n => n.x); const xm = (Math.min(...xs) + Math.max(...xs)) / 2; return v.ox + xm * v.scale - xm * scale; })();
    return { toScreen: (x, y) => [ox2 + x * scale, oy - y * scale], scale };
  }

  drawOutline(p) {
    const ctx = p.ctx, model = this.model, mp = this.mapper(p);
    ctx.save();
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5;
    for (const m of model.members) {
      const a = Model.node(model, m.n1), b = Model.node(model, m.n2);
      const [x1, y1] = mp.toScreen(a.x, a.y), [x2, y2] = mp.toScreen(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (const n of model.nodes) {
      const [x, y] = mp.toScreen(n.x, n.y);
      if (n.support.type !== 'none') { ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 9); ctx.lineTo(x + 5, y + 9); ctx.closePath(); ctx.fill(); }
      if (n.hinge) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 2 * Math.PI); ctx.fill(); }
    }
    ctx.restore();
  }

  drawForce(p, res) {
    const ctx = p.ctx, model = this.model, mp = this.mapper(p);
    const kind = p.kind;
    let maxAbs = kind === 'N' ? res.maxAbsN : kind === 'V' ? res.maxAbsV : res.maxAbsM;
    if (kind === 'M' && this.app.envelope) for (const id in this.app.envelope.members) { const e = this.app.envelope.members[id]; for (let i = 0; i < e.xs.length; i++) maxAbs = Math.max(maxAbs, Math.abs(e.max[i]), Math.abs(e.min[i])); }
    const resA = this.app.compareA && this.app.compareA.result && this.app.compareA.result.ok ? this.app.compareA.result : null;
    if (resA) maxAbs = Math.max(maxAbs, kind === 'N' ? resA.maxAbsN : kind === 'V' ? resA.maxAbsV : resA.maxAbsM);
    const H = Math.min(48, p.h * 0.32);
    const k = maxAbs > 1e-12 ? H / maxAbs : 0;
    const tension = model.settings.tensionSide;
    const F = model.settings.forceUnit, Lu = model.settings.lengthUnit;
    const unit = kind === 'M' ? `${F}·${Lu}` : F;
    const fmt = Analysis.fmt;
    const showVals = model.settings.showValues;
    // A/B 比較：A 的圖形以灰色虛線疊加
    if (resA) {
      ctx.save(); ctx.strokeStyle = '#6b7280'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      for (const id in resA.members) {
        const mr = resA.members[id], g = mr.geom;
        const px = -g.s, py = -g.c, sign = kind === 'M' && tension ? -1 : 1;
        ctx.beginPath();
        let first = true;
        for (const q of mr.pts) {
          const v = kind === 'N' ? q.N : kind === 'V' ? q.V : q.M;
          const [bx, by] = mp.toScreen(g.x1 + g.c * q.x, g.y1 + g.s * q.x);
          const sx = bx + px * v * k * sign, sy = by + py * v * k * sign;
          if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // 桿件很多（例如拱的分段）時只標示整體極值，避免雜亂
    const dense = Object.keys(res.members).length > 8;
    let gMax = null, gMin = null;
    if (dense) for (const id in res.members) {
      const mr = res.members[id];
      const mx = kind === 'N' ? mr.maxN : kind === 'V' ? mr.maxV : mr.maxM, mn = kind === 'N' ? mr.minN : kind === 'V' ? mr.minV : mr.minM;
      const vx = kind === 'N' ? mx.N : kind === 'V' ? mx.V : mx.M, vn = kind === 'N' ? mn.N : kind === 'V' ? mn.V : mn.M;
      if (!gMax || vx > gMax.v) gMax = { id, x: mx.x, v: vx };
      if (!gMin || vn < gMin.v) gMin = { id, x: mn.x, v: vn };
    }
    let infoParts = [];
    for (const id in res.members) {
      const mr = res.members[id];
      const g = mr.geom;
      // 局部 +y 的畫面方向
      const px = -g.s, py = -g.c; // 世界 (-s, c) → 畫面 (-s, -c)
      const sign = kind === 'M' && tension ? -1 : 1;
      const val = pt => kind === 'N' ? pt.N : kind === 'V' ? pt.V : pt.M;
      const toS = (x, v) => { const [bx, by] = mp.toScreen(g.x1 + g.c * x, g.y1 + g.s * x); return [bx + px * v * k * sign, by + py * v * k * sign]; };
      // 依符號分段填色
      ctx.save();
      for (const seg of mr.segs) {
        const pts = seg.pts;
        // 把每段拆成正負子段
        let cur = [], curSign = 0;
        const flush = () => {
          if (cur.length < 2) { cur = []; return; }
          ctx.beginPath();
          const [sx0, sy0] = toS(cur[0].x, 0); ctx.moveTo(sx0, sy0);
          for (const q of cur) { const [sx, sy] = toS(q.x, val(q)); ctx.lineTo(sx, sy); }
          const [sx1, sy1] = toS(cur[cur.length - 1].x, 0); ctx.lineTo(sx1, sy1); ctx.closePath();
          const pos = curSign >= 0;
          ctx.fillStyle = kind === 'N' ? (pos ? 'rgba(14,116,144,0.25)' : 'rgba(220,38,38,0.22)') : kind === 'V' ? (pos ? 'rgba(29,78,216,0.22)' : 'rgba(220,38,38,0.22)') : (pos ? 'rgba(21,128,61,0.25)' : 'rgba(180,83,9,0.25)');
          ctx.strokeStyle = kind === 'N' ? (pos ? Draw.COLORS.N : Draw.COLORS.Vn) : kind === 'V' ? (pos ? Draw.COLORS.Vp : Draw.COLORS.Vn) : (pos ? Draw.COLORS.Mp : Draw.COLORS.Mn);
          ctx.lineWidth = 1.5;
          ctx.fill(); ctx.stroke();
          cur = [];
        };
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i], v = val(q);
          const s = v > 1e-9 * Math.max(maxAbs, 1) ? 1 : v < -1e-9 * Math.max(maxAbs, 1) ? -1 : 0;
          if (cur.length && s !== 0 && curSign !== 0 && s !== curSign) {
            // 穿越零點：插入零點
            const prev = pts[i - 1], pv = val(prev);
            const t = pv / (pv - v), xz = prev.x + (q.x - prev.x) * t;
            cur.push({ x: xz, N: 0, V: 0, M: 0 });
            flush();
            cur.push({ x: xz, N: 0, V: 0, M: 0 }); curSign = s;
          }
          if (s !== 0 && curSign === 0) curSign = s;
          cur.push(q);
        }
        flush();
      }
      ctx.restore();
      // 數值標註
      if (showVals) {
        const labels = [];
        const addLabel = (x, v, side) => {
          if (labels.some(l => Math.abs(l.x - x) < 1e-9 && Math.abs(l.v - v) < 1e-9)) return;
          labels.push({ x, v, side });
        };
        if (dense) {
          if (gMax && gMax.id === id) addLabel(gMax.x, gMax.v);
          if (gMin && gMin.id === id) addLabel(gMin.x, gMin.v);
        } else for (const kp of mr.keys) {
          const v = val(kp);
          if (kind === 'M' && kp.kind === 'vzero') addLabel(kp.x, v);
          else if (kind === 'M' && kp.kind === 'mzero') addLabel(kp.x, 0, 'inflect');
          else if (kp.kind === 'end') addLabel(kp.x, v, kp.side);
          else if (kind === 'V' && kp.kind === 'vzero') addLabel(kp.x, 0, 'vzero');
        }
        for (const l of labels) {
          if (l.side === 'inflect') {
            const [sx, sy] = toS(l.x, 0);
            ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = Draw.COLORS.Mn; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.restore();
            Draw.label(ctx, `反曲點 x=${fmt(l.x)}`, sx, sy + 14, { color: Draw.COLORS.Mn, font: '10px system-ui, sans-serif' });
            continue;
          }
          if (l.side === 'vzero') {
            const [sx, sy] = toS(l.x, 0);
            Draw.label(ctx, `V=0 x=${fmt(l.x)}`, sx, sy - 10, { color: Draw.COLORS.Vp, font: '10px system-ui, sans-serif' });
            continue;
          }
          if (Math.abs(l.v) < 1e-9 * Math.max(maxAbs, 1)) continue;
          const [sx, sy] = toS(l.x, l.v);
          const off = 11 * (l.v * sign >= 0 ? 1 : -1);
          Draw.label(ctx, fmt(l.v), sx + px * off, sy + py * off, { color: '#111827', font: '11px system-ui, sans-serif' });
        }
      }
      // 活載重包絡線（彎矩圖）
      const env = kind === 'M' && this.app.envelope && this.app.envelope.members[id];
      if (env) {
        ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
        for (const [arr, col] of [[env.max, Draw.COLORS.Mp], [env.min, Draw.COLORS.Mn]]) {
          ctx.strokeStyle = col; ctx.beginPath();
          env.xs.forEach((x, i) => { const [sx, sy] = toS(x, arr[i]); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); });
          ctx.stroke();
        }
        ctx.restore();
      }
      const mm = kind === 'N' ? [mr.maxN.N, mr.minN.N] : kind === 'V' ? [mr.maxV.V, mr.minV.V] : [mr.maxM.M, mr.minM.M];
      if (!dense) infoParts.push(`桿${id}: ${fmt(mm[1])} ~ ${fmt(mm[0])}`);
    }
    if (dense && gMax && gMin) infoParts.push(`全體：${fmt(gMin.v)}（桿${gMin.id}）~ ${fmt(gMax.v)}（桿${gMax.id}）`);
    const note = kind === 'M' ? (tension ? '（畫在受拉側）' : '（正值朝上）') + (this.app.envelope ? '　虛線 = 活載重包絡線' : '') : '';
    p.info.textContent = `${infoParts.join('　')} ${unit} ${note}`;
  }

  drawDeflection(p, res) {
    const ctx = p.ctx, model = this.model, mp = this.mapper(p);
    const H = Math.min(40, p.h * 0.3);
    const resA = this.app.compareA && this.app.compareA.result && this.app.compareA.result.ok ? this.app.compareA.result : null;
    const maxDisp = Math.max(res.maxDisp, resA ? resA.maxDisp : 0);
    const k = maxDisp > 1e-15 ? H / maxDisp : 0;
    const Lu = model.settings.lengthUnit;
    if (resA) Draw.deformed(ctx, resA, mp.toScreen, k, { width: 1.5, dash: [5, 4], markers: false, mono: '#6b7280' });
    Draw.deformed(ctx, res, mp.toScreen, k);
    ctx.save();
    let maxTxt = [];
    for (const id in res.members) {
      const mr = res.members[id], g = mr.geom, df = mr.defl;
      // 節點轉角標示：剛接節點畫切線短桿，顯示夾角維持
      // 最大撓度標註
      const md = df.maxDefl;
      if (Math.abs(md.v) > 1e-15 && model.settings.showValues) {
        const i = df.xs.findIndex(x => x >= md.x - 1e-12);
        const u = df.u[i], v = df.v[i];
        const dX = g.c * u - g.s * v, dY = g.s * u + g.c * v;
        const [bx, by] = mp.toScreen(g.x1 + g.c * md.x, g.y1 + g.s * md.x);
        Draw.label(ctx, `δ = ${Analysis.fmtSci(Math.abs(md.v))} ${Lu}`, bx + dX * k, by - dY * k + (v < 0 ? 14 : -14), { color: Draw.COLORS.D, font: '11px system-ui, sans-serif' });
      }
      maxTxt.push(`桿${id}: δmax = ${Analysis.fmtSci(Math.abs(md.v))} @ x=${Analysis.fmt(md.x)}`);
    }
    // 節點：剛接節點畫兩短切線（夾角不變）、內鉸畫圓圈（折點）
    for (const n of model.nodes) {
      const ms = Model.connectedMembers(model, n.id).filter(m => !m.truss);
      if (ms.length < 2) continue;
      const d = res.disp[n.id];
      const [bx, by] = mp.toScreen(n.x, n.y);
      const sx = bx + d.ux * k, sy = by - d.uy * k;
      if (n.hinge) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); continue; }
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.2;
      for (const m of ms) {
        const g = Model.memberGeom(model, m);
        const dir = m.n1 === n.id ? 1 : -1;
        const ang = Math.atan2(g.s, g.c) + d.rz; // 旋轉後的桿軸方向
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dir * Math.cos(ang) * 14, sy - dir * Math.sin(ang) * 14); ctx.stroke();
      }
    }
    ctx.restore();
    p.info.textContent = `${maxTxt.join('　')} ${Lu}（放大顯示；綠 = M>0、橙 = M<0）`;
  }
}
