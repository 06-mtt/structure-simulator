// 畫布繪圖工具：箭頭、支承符號、載重符號、文字
const Draw = (() => {
  const COLORS = {
    member: '#2b3a55', truss: '#4a5d80', node: '#1f2937', hinge: '#ffffff',
    support: '#374151', load: '#c2410c', moment: '#7c3aed', nodal: '#b91c1c',
    reaction: '#047857', select: '#2563eb', hover: '#60a5fa', dim: '#6b7280',
    grid: '#e5e7eb', gridMajor: '#d1d5db', axis: '#9ca3af',
    N: '#0e7490', Vp: '#1d4ed8', Vn: '#dc2626', Mp: '#15803d', Mn: '#b45309', D: '#9333ea',
    mech: '#dc2626',
  };

  function arrow(ctx, x1, y1, x2, y2, color, head = 8, width = 1.8) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 0.5) { ctx.restore(); return; }
    const ux = dx / len, uy = dy / len;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * head * 0.6, y2 - uy * head * 0.6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * head - uy * head * 0.45, y2 - uy * head + ux * head * 0.45);
    ctx.lineTo(x2 - ux * head + uy * head * 0.45, y2 - uy * head - ux * head * 0.45);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 彎矩符號：圓弧箭頭，ccw 為逆時針（數學正向，畫面上為逆時針）
  function momentArrow(ctx, x, y, r, ccw, color, width = 1.8) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    // 畫面 y 向下，逆時針在畫面上要反向
    const a0 = -Math.PI * 0.15, a1 = Math.PI * 1.15;
    ctx.beginPath();
    if (ccw) ctx.arc(x, y, r, a1, a0, true); else ctx.arc(x, y, r, a0, a1, false);
    ctx.stroke();
    // 箭頭在終點
    const end = ccw ? a0 : a1;
    const ex = x + r * Math.cos(end), ey = y + r * Math.sin(end);
    const tdir = ccw ? -1 : 1; // 切線方向
    const tx = -Math.sin(end) * tdir, ty = Math.cos(end) * tdir;
    const h = 7;
    ctx.beginPath();
    ctx.moveTo(ex + tx * h * 0.5, ey + ty * h * 0.5);
    ctx.lineTo(ex - tx * h * 0.6 - ty * h * 0.5, ey - ty * h * 0.6 + tx * h * 0.5);
    ctx.lineTo(ex - tx * h * 0.6 + ty * h * 0.5, ey - ty * h * 0.6 - tx * h * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function label(ctx, text, x, y, opts = {}) {
    const { color = '#111827', font = '12px system-ui, sans-serif', align = 'center', baseline = 'middle', bg = 'rgba(255,255,255,0.85)', pad = 2 } = opts;
    ctx.save();
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = baseline;
    if (bg) {
      const w = ctx.measureText(text).width;
      let bx = x - pad; if (align === 'center') bx = x - w / 2 - pad; else if (align === 'right') bx = x - w - pad;
      let by = y - 7 - pad; if (baseline === 'top') by = y - pad; else if (baseline === 'bottom') by = y - 14 - pad;
      ctx.fillStyle = bg; ctx.fillRect(bx, by, w + 2 * pad, 14 + 2 * pad);
    }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function hatch(ctx, x1, y1, x2, y2, nx, ny, n, len, color) {
    // 沿線段 (x1,y1)-(x2,y2) 畫 n 條斜線，朝向 (nx,ny)
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1;
    const dx = (x2 - x1) / n, dy = (y2 - y1) / n;
    const dl = Math.hypot(x2 - x1, y2 - y1) / n;
    const tx = (x2 - x1) / Math.max(1e-9, Math.hypot(x2 - x1, y2 - y1)), ty = (y2 - y1) / Math.max(1e-9, Math.hypot(x2 - x1, y2 - y1));
    for (let i = 1; i <= n; i++) {
      const px = x1 + dx * i, py = y1 + dy * i;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * len - tx * dl, py + ny * len - ty * dl); ctx.stroke();
    }
    ctx.restore();
  }

  // 支承符號。(x,y) 畫面座標；angleDeg 為支承面傾角（數學正向）；
  // away = {x,y} 畫面單位向量，表示「遠離桿件」的方向（固定端用）
  function support(ctx, type, x, y, angleDeg = 0, away = null, color = COLORS.support, size = 14) {
    if (type === 'none') return;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
    if (type === 'fixed') {
      // 牆面垂直於 away 方向
      let ax = 0, ay = 1;
      if (away && (Math.abs(away.x) > 1e-6 || Math.abs(away.y) > 1e-6)) { ax = away.x; ay = away.y; }
      const ang = Math.atan2(ay, ax);
      ctx.rotate(ang - Math.PI / 2); // 使 away 指向畫面下方
      ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.lineWidth = 2.5; ctx.stroke();
      hatch(ctx, -size, 0, size, 0, -0.6, 0.8, 6, 9, color);
      ctx.restore(); return;
    }
    ctx.rotate(-angleDeg * Math.PI / 180);
    const h = size, w = size * 0.8;
    if (type === 'pin' || type === 'roller') {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w, h); ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = '#f9fafb'; ctx.fill(); ctx.stroke();
      if (type === 'roller') {
        const r = 3;
        for (const cx of [-w * 0.55, 0, w * 0.55]) { ctx.beginPath(); ctx.arc(cx, h + r + 1, r, 0, 2 * Math.PI); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-w - 4, h + 2 * r + 2); ctx.lineTo(w + 4, h + 2 * r + 2); ctx.stroke();
        hatch(ctx, -w - 4, h + 2 * r + 2, w + 4, h + 2 * r + 2, -0.6, 0.8, 5, 6, color);
      } else {
        ctx.beginPath(); ctx.moveTo(-w - 4, h); ctx.lineTo(w + 4, h); ctx.stroke();
        hatch(ctx, -w - 4, h, w + 4, h, -0.6, 0.8, 5, 6, color);
      }
    } else if (type === 'guide') {
      // 導向支承：兩條平行線夾滾輪，可沿支承面滑動；束制轉動與垂直向
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.lineWidth = 1.6;
      const r = 3;
      for (const cx of [-w * 0.5, w * 0.5]) { ctx.beginPath(); ctx.arc(cx, r + 1, r, 0, 2 * Math.PI); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-w - 4, 2 * r + 2); ctx.lineTo(w + 4, 2 * r + 2); ctx.stroke();
      hatch(ctx, -w - 4, 2 * r + 2, w + 4, 2 * r + 2, -0.6, 0.8, 5, 6, color);
    } else if (type === 'spring') {
      ctx.beginPath(); ctx.moveTo(0, 0);
      const n = 5, len = h + 6;
      for (let i = 1; i <= n; i++) ctx.lineTo((i % 2 ? -1 : 1) * w * 0.5, len * i / (n + 1));
      ctx.lineTo(0, len); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w - 2, len); ctx.lineTo(w + 2, len); ctx.stroke();
      hatch(ctx, -w - 2, len, w + 2, len, -0.6, 0.8, 4, 6, color);
    }
    ctx.restore();
  }

  function node(ctx, x, y, r, color = COLORS.node) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  }
  function hinge(ctx, x, y, r = 5) {
    ctx.save(); ctx.fillStyle = COLORS.hinge; ctx.strokeStyle = COLORS.node; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  // 集中力：箭頭尖端在 (x,y)，angleDeg 為力的方向（數學座標，y 向上）
  function pointLoad(ctx, x, y, angleDeg, len, color, text) {
    const th = -angleDeg * Math.PI / 180;
    const ux = Math.cos(th), uy = Math.sin(th);
    arrow(ctx, x - ux * len, y - uy * len, x, y, color, 9, 2);
    if (text) label(ctx, text, x - ux * (len + 10), y - uy * (len + 10), { color });
    return { x1: x - ux * len, y1: y - uy * len, x2: x, y2: y };
  }

  // 分布載重：沿 (ax,ay)-(bx,by) 畫面線段，方向 (dx,dy) 為力方向（畫面單位向量），h1,h2 為兩端箭頭長度（px）
  function distLoad(ctx, ax, ay, bx, by, dx, dy, h1, h2, color, text) {
    const L = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(L / 22));
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    const tops = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, h = h1 + (h2 - h1) * t;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      const sx = px - dx * h, sy = py - dy * h;
      tops.push([sx, sy]);
      if (h > 2) arrow(ctx, sx, sy, px, py, color, 7, 1.4);
    }
    ctx.beginPath(); ctx.moveTo(tops[0][0], tops[0][1]); ctx.lineTo(tops[n][0], tops[n][1]); ctx.stroke();
    ctx.restore();
    if (text) {
      const mx = (tops[0][0] + tops[n][0]) / 2 - dx * 10, my = (tops[0][1] + tops[n][1]) / 2 - dy * 10;
      label(ctx, text, mx, my, { color });
    }
    return tops;
  }

  function dimLine(ctx, x1, y1, x2, y2, text, color = COLORS.dim) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
    label(ctx, text, (x1 + x2) / 2, (y1 + y2) / 2, { color, font: '11px system-ui, sans-serif' });
  }

  // 變形曲線：依彎矩符號著色（M>0 綠、M<0 橙、≈0 紫），k = 畫面 px / 位移單位
  function deformed(ctx, res, toScreen, k, opts = {}) {
    const { width = 2.2, dash = null, markers = true, mono = null } = opts;
    ctx.save();
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    for (const id in res.members) {
      const mr = res.members[id], g = mr.geom, df = mr.defl;
      const tol = Math.max(mr.tolM, 1e-6 * Math.max(res.maxAbsM, 1));
      const screenPt = i => {
        const x = df.xs[i], u = df.u[i], v = df.v[i];
        const dX = g.c * u - g.s * v, dY = g.s * u + g.c * v;
        const [bx, by] = toScreen(g.x1 + g.c * x, g.y1 + g.s * x);
        return [bx + dX * k, by - dY * k];
      };
      let curColor = null;
      ctx.beginPath();
      let [px, py] = screenPt(0); ctx.moveTo(px, py);
      for (let i = 1; i < df.xs.length; i++) {
        const M = mr.fns.at((df.xs[i - 1] + df.xs[i]) / 2).M;
        const col = mono ? mono : M > tol ? COLORS.Mp : M < -tol ? COLORS.Mn : COLORS.D;
        if (col !== curColor) {
          if (curColor) { ctx.strokeStyle = curColor; ctx.stroke(); ctx.beginPath(); ctx.moveTo(px, py); }
          curColor = col;
        }
        [px, py] = screenPt(i); ctx.lineTo(px, py);
      }
      ctx.strokeStyle = curColor || COLORS.D; ctx.stroke();
      if (markers) {
        // 反曲點
        for (const kp of mr.keys) {
          if (kp.kind !== 'mzero') continue;
          const i = Math.min(df.xs.length - 1, Math.round(kp.x / g.L * (df.xs.length - 1)));
          const [sx, sy] = screenPt(i);
          ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = COLORS.Mn; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
          ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
        }
      }
    }
    ctx.restore();
  }

  return { COLORS, arrow, momentArrow, label, support, node, hinge, pointLoad, distLoad, dimLine, hatch, deformed };
})();
