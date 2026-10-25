// 內力函數、圖形取樣、極值與反曲點、變形曲線、圖形特徵、常用標準值
const Analysis = (() => {
  // 由桿件起端往右累加的內力函數（左段法）
  // 符號：V 正 = 左段受力朝局部 +y；M 正 = 下側受拉（局部 −y 側受拉）；N 正 = 拉力
  function memberFunctions(mr) {
    const { f1, loads } = mr;
    const L = mr.geom.L;
    function distInt(ld, x) {
      // 回傳 [∫q ds, ∫q·s ds] 於 [a, min(x,b)]，q 為線性
      const t = Math.min(x, ld.b);
      if (t <= ld.a) return [0, 0, 0, 0];
      const k1 = (ld.qy2 - ld.qy1) / (ld.b - ld.a), k0 = (ld.qx2 - ld.qx1) / (ld.b - ld.a);
      const a = ld.a, d = t - a;
      const Qy = ld.qy1 * d + k1 * d * d / 2;
      const Qys = ld.qy1 * (t * t - a * a) / 2 + k1 * ((t * t * t - a * a * a) / 3 - a * (t * t - a * a) / 2);
      const Qx = ld.qx1 * d + k0 * d * d / 2;
      return [Qy, Qys, Qx];
    }
    function at(x) {
      let V = f1.fy, M = f1.fy * x - f1.m, N = -f1.fx;
      for (const ld of loads) {
        if (ld.kind === 'point') {
          if (ld.x < x) { V += ld.py; M += ld.py * (x - ld.x); N -= ld.px; }
        } else if (ld.kind === 'couple') {
          if (ld.x < x) M -= ld.C;
        } else if (ld.kind === 'dist') {
          const [Qy, Qys, Qx] = distInt(ld, x);
          V += Qy; M += x * Qy - Qys; N -= Qx;
        }
      }
      return { N, V, M };
    }
    const eps = 1e-9 * Math.max(L, 1);
    return {
      at,
      N: x => at(x).N, V: x => at(x).V, M: x => at(x).M,
      left: x => at(x - eps),   // x 左側
      right: x => at(x + eps),  // x 右側
      eps, L,
    };
  }

  function breakpoints(mr) {
    const L = mr.geom.L;
    const set = new Set([0, L]);
    for (const ld of mr.loads) {
      if (ld.kind === 'point' || ld.kind === 'couple') set.add(ld.x);
      if (ld.kind === 'dist') { set.add(ld.a); set.add(ld.b); }
    }
    return [...set].filter(x => x >= 0 && x <= L).sort((a, b) => a - b);
  }

  function bisect(fn, a, b, fa) {
    let lo = a, hi = b, flo = fa;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2, fm = fn(mid);
      if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // 取樣與關鍵點
  function sampleMember(mr) {
    const fns = memberFunctions(mr);
    const bps = breakpoints(mr);
    const pts = [];
    const segs = [];
    const keys = [];
    let maxAbsV = 0, maxAbsM = 0, maxAbsN = 0;
    for (let k = 0; k + 1 < bps.length; k++) {
      const xa = bps[k], xb = bps[k + 1];
      if (xb - xa < 1e-12) continue;
      const n = 40;
      const seg = [];
      for (let i = 0; i <= n; i++) {
        const x = xa + (xb - xa) * i / n;
        const v = i === 0 ? fns.right(x) : i === n ? fns.left(x) : fns.at(x);
        seg.push({ x, ...v });
        maxAbsV = Math.max(maxAbsV, Math.abs(v.V)); maxAbsM = Math.max(maxAbsM, Math.abs(v.M)); maxAbsN = Math.max(maxAbsN, Math.abs(v.N));
      }
      pts.push(...seg);
      segs.push({ xa, xb, pts: seg });
    }
    const tolV = 1e-9 * Math.max(maxAbsV, 1), tolM = 1e-9 * Math.max(maxAbsM, 1);
    // 關鍵點：每段兩端、V=0、M=0
    for (const sg of segs) {
      const a = sg.pts[0], b = sg.pts[sg.pts.length - 1];
      keys.push({ x: a.x, side: '+', kind: 'end', ...pick(a) });
      keys.push({ x: b.x, side: '-', kind: 'end', ...pick(b) });
      const constV = sg.pts.every(p => Math.abs(p.V) < tolV);
      for (let i = 0; i + 1 < sg.pts.length; i++) {
        const p = sg.pts[i], q = sg.pts[i + 1];
        if (!constV && Math.abs(p.V) >= tolV && (p.V < 0) !== (q.V < 0)) {
          const x = bisect(fns.V, p.x, q.x, p.V);
          const v = fns.at(x);
          keys.push({ x, side: '', kind: 'vzero', ...v });
        } else if (!constV && Math.abs(p.V) < tolV && i > 0) {
          const v = fns.at(p.x);
          keys.push({ x: p.x, side: '', kind: 'vzero', ...v });
        }
        if (Math.abs(p.M) >= tolM && Math.abs(q.M) >= tolM && (p.M < 0) !== (q.M < 0)) {
          const x = bisect(fns.M, p.x, q.x, p.M);
          const v = fns.at(x);
          keys.push({ x, side: '', kind: 'mzero', ...v });
        }
      }
    }
    // 極值
    let maxM = null, minM = null, maxV = null, minV = null, maxN = null, minN = null;
    for (const kp of keys) {
      if (!maxM || kp.M > maxM.M) maxM = kp;
      if (!minM || kp.M < minM.M) minM = kp;
      if (!maxV || kp.V > maxV.V) maxV = kp;
      if (!minV || kp.V < minV.V) minV = kp;
      if (!maxN || kp.N > maxN.N) maxN = kp;
      if (!minN || kp.N < minN.N) minN = kp;
    }
    return { fns, bps, pts, segs, keys, maxAbsV, maxAbsM, maxAbsN, maxM, minM, maxV, minV, maxN, minN, tolV, tolM };
  }
  function pick(p) { return { N: p.N, V: p.V, M: p.M }; }

  // 變形曲線（局部座標）：以 v'' = M/EI 數值積分，端點位移取自勁度法解
  function deflection(mr, fns, alpha) {
    const L = mr.geom.L, EI = mr.E * mr.I, EA = mr.E * mr.A;
    const n = 200;
    const xs = new Array(n + 1), kap = new Array(n + 1), eps = new Array(n + 1);
    let dT = 0, k0 = 0;
    for (const ld of mr.loads) if (ld.kind === 'temp') { dT += ld.dT; if (ld.h > 0) k0 += alpha * ld.dTd / ld.h; }
    for (let i = 0; i <= n; i++) {
      const x = L * i / n;
      const v = i === 0 ? fns.right(x) : i === n ? fns.left(x) : fns.at(x);
      xs[i] = x; kap[i] = v.M / EI + k0; eps[i] = v.N / EA + alpha * dT;
    }
    const h = L / n;
    const th = new Array(n + 1).fill(0), vv = new Array(n + 1).fill(0), uu = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      th[i] = th[i - 1] + (kap[i - 1] + kap[i]) * h / 2;
      vv[i] = vv[i - 1] + (th[i - 1] + th[i]) * h / 2;
      uu[i] = uu[i - 1] + (eps[i - 1] + eps[i]) * h / 2;
    }
    const u1 = mr.ul[0], v1 = mr.ul[1], u2 = mr.ul[3], v2 = mr.ul[4];
    const th1 = (v2 - v1 - vv[n]) / L; // 由邊界條件求起端斜率
    const v = xs.map((x, i) => v1 + th1 * x + vv[i]);
    const theta = xs.map((x, i) => th1 + th[i]);
    const u = xs.map((x, i) => u1 + uu[i] + (u2 - u1 - uu[n]) * x / L);
    let maxV = { x: 0, v: 0 };
    v.forEach((val, i) => { if (Math.abs(val) > Math.abs(maxV.v)) maxV = { x: xs[i], v: val }; });
    return { xs, u, v, theta, maxDefl: maxV };
  }

  // 圖形特徵文字（面積法、不連續、極值、反曲點）
  function features(mr, sm, label) {
    const out = [];
    const f = (v) => fmt(v);
    const L = mr.geom.L;
    const fns = sm.fns;
    for (const ld of mr.loads) {
      if (ld.kind === 'point') {
        const l = fns.left(ld.x), r = fns.right(ld.x);
        const parts = [];
        if (Math.abs(ld.py) > 1e-9) parts.push(`剪力圖跳躍 ΔV = ${f(r.V - l.V)}，彎矩圖轉折（斜率改變）`);
        if (Math.abs(ld.px) > 1e-9) parts.push(`軸力圖跳躍 ΔN = ${f(r.N - l.N)}`);
        if (parts.length) out.push({ x: ld.x, text: `${label}x = ${f(ld.x)}：集中力 → ${parts.join('；')}` });
      } else if (ld.kind === 'couple') {
        const l = fns.left(ld.x), r = fns.right(ld.x);
        out.push({ x: ld.x, text: `${label}x = ${f(ld.x)}：集中彎矩 → 彎矩圖跳躍 ΔM = ${f(r.M - l.M)}，剪力圖不變` });
      } else if (ld.kind === 'dist') {
        const lin = Math.abs(ld.qy1 - ld.qy2) < 1e-12;
        out.push({ x: ld.a, text: `${label}x = ${f(ld.a)} ~ ${f(ld.b)}：${lin ? '均布載重 → 剪力線性、彎矩二次拋物線' : '線性變化載重 → 剪力二次、彎矩三次曲線'}` });
      }
    }
    for (const kp of sm.keys) {
      if (kp.kind === 'vzero') out.push({ x: kp.x, text: `${label}x = ${f(kp.x)}：V = 0 → 彎矩極值 M = ${f(kp.M)}` });
      if (kp.kind === 'mzero') out.push({ x: kp.x, text: `${label}x = ${f(kp.x)}：M = 0 → 反曲點` });
    }
    // 面積法
    for (const sg of sm.segs) {
      const a = sg.pts[0], b = sg.pts[sg.pts.length - 1];
      const dM = b.M - a.M;
      if (Math.abs(dM) > 1e-9 || Math.abs(a.V) > 1e-9)
        out.push({ x: sg.xa, area: true, text: `${label}段 [${f(sg.xa)}, ${f(sg.xb)}]：V 圖面積 = ΔM = ${f(b.M)} − (${f(a.M)}) = ${f(dM)}` });
    }
    out.sort((p, q) => p.x - q.x || (p.area ? 1 : -1));
    return out.map(o => o.text);
  }

  function fmt(v, d = 3) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 1e-9) return '0';
    const a = Math.abs(v);
    let s;
    if (a >= 1000) s = v.toFixed(0);
    else if (a >= 100) s = v.toFixed(1);
    else if (a >= 10) s = v.toFixed(2);
    else s = v.toFixed(d);
    s = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    return s === '-0' ? '0' : s;
  }
  function fmtSci(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 0.01 && a < 1e5) return fmt(v, 4);
    return v.toExponential(3);
  }

  // 常用標準值偵測（僅限水平直梁）
  function standardCases(model, res) {
    const out = [];
    const nodes = model.nodes.filter(n => Model.connectedMembers(model, n.id).length);
    if (!nodes.length || !model.members.length) return out;
    const y0 = nodes[0].y;
    if (!nodes.every(n => Math.abs(n.y - y0) < 1e-9)) return out;
    if (model.members.some(m => m.truss) || nodes.some(n => n.hinge || n.support.type === 'spring' || n.support.type === 'guide' || Math.abs(n.support.angle) > 1e-9)) return out;
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    const xmin = sorted[0].x, xmax = sorted[sorted.length - 1].x, L = xmax - xmin;
    if (L < 1e-9) return out;
    const sups = sorted.filter(n => n.support.type !== 'none');
    const interior = sups.filter(n => n.x > xmin + 1e-9 && n.x < xmax - 1e-9);
    if (interior.length) return out;
    const left = sorted[0].support.type, right = sorted[sorted.length - 1].support.type;
    // 載重整理：絕對座標
    const pts = [], udls = [];
    for (const n of sorted) {
      if (n.loads.fx || n.loads.m) return out;
      if (n.loads.fy) pts.push({ x: n.x, P: -n.loads.fy });
    }
    for (const m of model.members) {
      const g = Model.memberGeom(model, m);
      for (const ld of m.loads) {
        if (ld.type === 'point') { if (Math.abs(((ld.angle % 360) + 360) % 360 - 270) > 1e-9) return out; pts.push({ x: g.x1 + ld.pos, P: ld.P }); }
        else if (ld.type === 'udl') udls.push({ a: g.x1 + ld.a, b: g.x1 + ld.b, w1: ld.w1, w2: ld.w2 });
        else return out;
      }
    }
    // 均布合併（相鄰且等值）
    udls.sort((p, q) => p.a - q.a);
    const merged = [];
    for (const u of udls) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.b - u.a) < 1e-9 && Math.abs(last.w2 - u.w1) < 1e-9 && Math.abs((last.w2 - last.w1) / Math.max(last.b - last.a, 1e-9) - (u.w2 - u.w1) / Math.max(u.b - u.a, 1e-9)) < 1e-9) { last.b = u.b; last.w2 = u.w2; }
      else merged.push({ ...u });
    }
    const E = model.members[0].E, I = model.members[0].I, EI = E * I;
    const F = model.settings.forceUnit, Lu = model.settings.lengthUnit;
    const f = fmt;
    const simple = (left === 'pin' || left === 'roller') && (right === 'pin' || right === 'roller') && sups.length === 2;
    const cantL = left === 'fixed' && right === 'none' && sups.length === 1;
    const cantR = right === 'fixed' && left === 'none' && sups.length === 1;
    const fixedBoth = left === 'fixed' && right === 'fixed';
    const propped = (left === 'fixed' && (right === 'pin' || right === 'roller')) || (right === 'fixed' && (left === 'pin' || left === 'roller'));
    const onePoint = pts.length === 1 && merged.length === 0;
    const oneUDL = merged.length === 1 && pts.length === 0 && Math.abs(merged[0].a - xmin) < 1e-9 && Math.abs(merged[0].b - xmax) < 1e-9;
    const uniform = oneUDL && Math.abs(merged[0].w1 - merged[0].w2) < 1e-9;
    const tri = oneUDL && (Math.abs(merged[0].w1) < 1e-9 || Math.abs(merged[0].w2) < 1e-9) && !uniform;
    const Lk = `${f(L)}`;
    if (simple && onePoint) {
      const P = pts[0].P, a = pts[0].x - xmin, b = L - a;
      const lines = [];
      if (Math.abs(a - L / 2) < 1e-9) {
        lines.push(`Mmax = PL/4 = ${f(P)}×${Lk}/4 = ${f(P * L / 4)} ${F}·${Lu}（在中點）`);
        lines.push(`R = P/2 = ${f(P / 2)} ${F}；Vmax = P/2`);
        lines.push(`δmax = PL³/48EI = ${fmtSci(P * L ** 3 / (48 * EI))} ${Lu}`);
      } else {
        lines.push(`Mmax = Pab/L = ${f(P)}×${f(a)}×${f(b)}/${Lk} = ${f(P * a * b / L)} ${F}·${Lu}（在載重點下方）`);
        lines.push(`R左 = Pb/L = ${f(P * b / L)} ${F}；R右 = Pa/L = ${f(P * a / L)} ${F}`);
      }
      out.push({ title: '簡支梁＋集中載重', lines });
    } else if (simple && uniform) {
      const w = merged[0].w1;
      out.push({ title: '簡支梁＋均布載重', lines: [
        `Mmax = wL²/8 = ${f(w)}×${Lk}²/8 = ${f(w * L * L / 8)} ${F}·${Lu}（在中點）`,
        `R = wL/2 = ${f(w * L / 2)} ${F}；Vmax = wL/2（在支承處）`,
        `δmax = 5wL⁴/384EI = ${fmtSci(5 * w * L ** 4 / (384 * EI))} ${Lu}`,
      ] });
    } else if (simple && tri) {
      const w = Math.max(merged[0].w1, merged[0].w2);
      const zeroLeft = Math.abs(merged[0].w1) < 1e-9;
      out.push({ title: '簡支梁＋三角形載重', lines: [
        `R（零端）= wL/6 = ${f(w * L / 6)} ${F}；R（滿端）= wL/3 = ${f(w * L / 3)} ${F}`,
        `Mmax = wL²/(9√3) ≈ 0.0642wL² = ${f(w * L * L / (9 * Math.sqrt(3)))} ${F}·${Lu}，位置距零端 L/√3 = ${f(L / Math.sqrt(3))} ${Lu}（${zeroLeft ? '由左' : '由右'}量起）`,
      ] });
    } else if ((cantL || cantR) && onePoint) {
      const P = pts[0].P, a = cantL ? pts[0].x - xmin : xmax - pts[0].x;
      const lines = [];
      if (Math.abs(a - L) < 1e-9) {
        lines.push(`固定端 M = PL = ${f(P)}×${Lk} = ${f(P * L)} ${F}·${Lu}（負彎矩，上側受拉）；V = P = ${f(P)} ${F}`);
        lines.push(`δ端 = PL³/3EI = ${fmtSci(P * L ** 3 / (3 * EI))} ${Lu}；θ端 = PL²/2EI = ${fmtSci(P * L * L / (2 * EI))} rad`);
      } else {
        lines.push(`固定端 M = Pa = ${f(P)}×${f(a)} = ${f(P * a)} ${F}·${Lu}；載重點以外彎矩為零`);
        lines.push(`δ端 = Pa²(3L−a)/6EI = ${fmtSci(P * a * a * (3 * L - a) / (6 * EI))} ${Lu}`);
      }
      out.push({ title: '懸臂梁＋集中載重', lines });
    } else if ((cantL || cantR) && uniform) {
      const w = merged[0].w1;
      out.push({ title: '懸臂梁＋均布載重', lines: [
        `固定端 M = wL²/2 = ${f(w)}×${Lk}²/2 = ${f(w * L * L / 2)} ${F}·${Lu}；V = wL = ${f(w * L)} ${F}`,
        `δ端 = wL⁴/8EI = ${fmtSci(w * L ** 4 / (8 * EI))} ${Lu}；θ端 = wL³/6EI = ${fmtSci(w * L ** 3 / (6 * EI))} rad`,
      ] });
    } else if (fixedBoth && uniform) {
      const w = merged[0].w1;
      out.push({ title: '固定梁＋均布載重', lines: [
        `端點 M = wL²/12 = ${f(w * L * L / 12)} ${F}·${Lu}（負）；中點 M = wL²/24 = ${f(w * L * L / 24)} ${F}·${Lu}（正）`,
        `R = wL/2 = ${f(w * L / 2)} ${F}；δmax = wL⁴/384EI = ${fmtSci(w * L ** 4 / (384 * EI))} ${Lu}`,
        `反曲點距端點 0.211L = ${f(0.2113 * L)} ${Lu}`,
      ] });
    } else if (fixedBoth && onePoint && Math.abs(pts[0].x - xmin - L / 2) < 1e-9) {
      const P = pts[0].P;
      out.push({ title: '固定梁＋中央集中載重', lines: [
        `端點 M = PL/8 = ${f(P * L / 8)} ${F}·${Lu}（負）；中點 M = PL/8（正）`,
        `R = P/2 = ${f(P / 2)} ${F}；δmax = PL³/192EI = ${fmtSci(P * L ** 3 / (192 * EI))} ${Lu}`,
      ] });
    } else if (propped && uniform) {
      const w = merged[0].w1;
      out.push({ title: '一端固定一端簡支＋均布載重', lines: [
        `固定端 M = wL²/8 = ${f(w * L * L / 8)} ${F}·${Lu}（負）`,
        `R固定端 = 5wL/8 = ${f(5 * w * L / 8)} ${F}；R簡支端 = 3wL/8 = ${f(3 * w * L / 8)} ${F}`,
        `正彎矩最大 9wL²/128 = ${f(9 * w * L * L / 128)} ${F}·${Lu}，距簡支端 3L/8 = ${f(3 * L / 8)} ${Lu}；反曲點距固定端 L/4`,
      ] });
    } else if (propped && onePoint && Math.abs(pts[0].x - xmin - L / 2) < 1e-9) {
      const P = pts[0].P;
      out.push({ title: '一端固定一端簡支＋中央集中載重', lines: [
        `固定端 M = 3PL/16 = ${f(3 * P * L / 16)} ${F}·${Lu}（負）；載重點 M = 5PL/32 = ${f(5 * P * L / 32)} ${F}·${Lu}（正）`,
        `R固定端 = 11P/16 = ${f(11 * P / 16)} ${F}；R簡支端 = 5P/16 = ${f(5 * P / 16)} ${F}`,
      ] });
    }
    return out;
  }

  // 節點處的彎矩（取連接桿件的桿端值；內鉸處為 0）
  function nodeMoment(model, res, nodeId) {
    for (const id in res.members) {
      const mr = res.members[id];
      if (mr.member.n1 === nodeId) return mr.fns.right(0).M;
      if (mr.member.n2 === nodeId) return mr.fns.left(mr.geom.L).M;
    }
    return 0;
  }

  // 三鉸系統 / 拱 / 纜索：以「等效簡支梁彎矩 M0」與水平推力 H 對照
  // 條件：兩個支承同高、皆為鉸或固定、所有載重皆垂直
  function funicular(model, res) {
    const nodes = model.nodes.filter(n => Model.connectedMembers(model, n.id).length);
    const sups = nodes.filter(n => n.support.type !== 'none');
    if (sups.length !== 2 || !model.members.length) return null;
    if (sups.some(n => (n.support.type !== 'pin' && n.support.type !== 'fixed') || Math.abs(n.support.angle) > 1e-9)) return null;
    const [A, B] = sups[0].x < sups[1].x ? sups : [sups[1], sups[0]];
    if (Math.abs(A.y - B.y) > 1e-9) return null;
    const y0 = A.y, L = B.x - A.x;
    if (L < 1e-9) return null;
    if (nodes.every(n => Math.abs(n.y - y0) < 1e-9)) return null; // 純梁不適用
    // 載重整理為絕對座標、每單位水平長度
    const pts = [], dists = [];
    for (const n of nodes) {
      if (Math.abs(n.loads.fx) > 1e-9 || Math.abs(n.loads.m) > 1e-9) return null;
      if (n.loads.fy) pts.push({ x: n.x, P: -n.loads.fy });
    }
    for (const m of model.members) {
      const g = Model.memberGeom(model, m);
      for (const ld of m.loads) {
        if (ld.type === 'point') {
          if (Math.abs(((ld.angle % 360) + 360) % 360 - 270) > 1e-9) return null;
          pts.push({ x: g.x1 + g.c * ld.pos, P: ld.P });
        } else if (ld.type === 'udl') {
          if (ld.dir === 'local') return null;
          const W = (ld.w1 + ld.w2) / 2 * (ld.b - ld.a) * (ld.dir === 'projected' ? Math.abs(g.c) : 1);
          if (Math.abs(g.c) < 1e-9) { pts.push({ x: g.x1, P: W }); continue; }
          const k = ld.dir === 'projected' ? 1 : 1 / Math.abs(g.c); // 轉成每單位水平長度
          const xa = g.x1 + g.c * ld.a, xb = g.x1 + g.c * ld.b;
          dists.push(xa < xb ? { a: xa, b: xb, w1: ld.w1 * k, w2: ld.w2 * k } : { a: xb, b: xa, w1: ld.w2 * k, w2: ld.w1 * k });
        } else if (ld.type === 'moment') return null;
      }
    }
    // 等效簡支梁
    let W = 0, Wx = 0;
    for (const p of pts) { W += p.P; Wx += p.P * (p.x - A.x); }
    for (const d of dists) { const w = (d.w1 + d.w2) / 2 * (d.b - d.a); const xc = d.a + (d.b - d.a) * (d.w1 + 2 * d.w2) / (3 * (d.w1 + d.w2) || 1); W += w; Wx += w * (xc - A.x); }
    const RB = Wx / L, RA = W - RB;
    const M0 = x => {
      let M = RA * (x - A.x);
      for (const p of pts) if (p.x < x) M -= p.P * (x - p.x);
      for (const d of dists) {
        const t = Math.min(x, d.b); if (t <= d.a) continue;
        const k = (d.w2 - d.w1) / (d.b - d.a), a = d.a, dd = t - a;
        const Q = d.w1 * dd + k * dd * dd / 2;
        const Qs = d.w1 * (t * t - a * a) / 2 + k * ((t * t * t - a * a * a) / 3 - a * (t * t - a * a) / 2);
        M -= x * Q - Qs;
      }
      return M;
    };
    const hinges = nodes.filter(n => n.hinge && Math.abs(n.y - y0) > 1e-9);
    const isCable = model.meta && model.meta.kind === 'cable';
    const kind = isCable ? 'cable' : hinges.length === 1 ? 'three' : 'indet';
    let H, Hsrc, crown = null;
    if (kind === 'three') {
      crown = hinges[0];
      H = M0(crown.x) / (crown.y - y0);
      Hsrc = `對頂鉸取矩：H = M0(x_c) / y_c = ${fmt(M0(crown.x))} / ${fmt(crown.y - y0)} = ${fmt(H)}`;
    } else {
      H = -(res.reactions[A.id] ? res.reactions[A.id].fx : 0);
      Hsrc = isCable ? `由支承水平反力得 H = ${fmt(H)}` : `靜不定系統：H 由勁度法求得 = ${fmt(H)}（兩鉸拱、固定拱無法只靠平衡式求 H）`;
    }
    const sign = isCable ? -1 : 1;
    const rows = nodes.filter(n => n.id !== A.id && n.id !== B.id).sort((p, q) => p.x - q.x).map(n => ({
      id: n.id, x: n.x, y: n.y - y0, M0: M0(n.x), Hy: H * (n.y - y0), Mpred: M0(n.x) - H * (n.y - y0), M: nodeMoment(model, res, n.id), hinge: n.hinge,
    }));
    const f = Math.max(...nodes.map(n => Math.abs(n.y - y0)));
    const lines = [];
    // 標準公式：均布滿跨 + 拋物線
    const uniformFull = pts.length === 0 && dists.length >= 1 && Math.abs(Math.min(...dists.map(d => d.a)) - A.x) < 1e-6 && Math.abs(Math.max(...dists.map(d => d.b)) - B.x) < 1e-6 && dists.every(d => Math.abs(d.w1 - dists[0].w1) < 1e-9 && Math.abs(d.w2 - d.w1) < 1e-9);
    const nodalUniform = dists.length === 0 && pts.length >= 2 && (() => { const inner = nodes.filter(n => n.id !== A.id && n.id !== B.id); return inner.length === pts.length; })();
    // 節點等間距集中力時，等效均布 w = 每個節點力 ÷ 節點間距
    const w = uniformFull ? dists[0].w1 : nodalUniform ? W / (L - L / (pts.length + 1)) : 0;
    const parabola = model.meta && model.meta.shape === 'parabola';
    if (w) {
      lines.push(`等效簡支梁：R_A = R_B = wL/2 = ${fmt(w * L / 2)}，M0,max = wL²/8 = ${fmt(w * L * L / 8)}`);
      if (parabola || kind === 'cable') lines.push(`均布載重＋拋物線：H = wL²/(8f) = ${fmt(w)}×${fmt(L)}²/(8×${fmt(f)}) = ${fmt(w * L * L / (8 * f))}（計算值 ${fmt(H)}）`);
      if (kind === 'cable') lines.push(`T_max = √(H² + (wL/2)²) = ${fmt(Math.hypot(w * L * L / (8 * f), w * L / 2))}（在支承處）；最低點 T_min = H`);
      if (parabola && !isCable) lines.push('拋物線拱＋均布（沿水平投影）→ 壓力線與拱軸重合，各處 M ≈ 0、V ≈ 0，純壓力（節點間以直線近似，故有微小殘值）');
    } else {
      lines.push(`等效簡支梁：R_A = ${fmt(RA)}，R_B = ${fmt(RB)}`);
    }
    lines.push(Hsrc);
    if (kind === 'three') lines.push(`三鉸系統：對頂鉸取矩 M = M0 − H·y = 0，任一點 M(x) = M0(x) − H·y(x)（拱與剛架皆同）`);
    if (isCable) lines.push(`纜索：形狀即彎矩圖 y(x) = M0(x)/H（垂度與 M0 成正比），各段只有拉力；拱為其倒置（受壓）`);
    else lines.push('拱的壓力線 = 纜索（倒置）的形狀；載重分布改變時，壓力線偏離拱軸，產生彎矩');
    const maxN = Math.max(...Object.values(res.members).map(mr => Math.max(Math.abs(mr.maxN.N), Math.abs(mr.minN.N))));
    return { kind, isCable, A, B, L, f, H, RA, RB, crown, rows, lines, maxN, M0 };
  }

  // 變形判讀文字
  function deformNotes(model, res) {
    const out = [];
    const nodes = model.nodes.filter(n => Model.connectedMembers(model, n.id).length);
    const sideWord = (g, tensionLocalNeg) => {
      // 受拉側向量：M>0 → 局部 −y；M<0 → 局部 +y
      const tx = tensionLocalNeg ? g.s : -g.s, ty = tensionLocalNeg ? -g.c : g.c;
      if (Math.abs(tx) > Math.abs(ty)) return tx > 0 ? '右側' : '左側';
      return ty > 0 ? '上側' : '下側';
    };
    for (const n of nodes) {
      const d = res.disp[n.id];
      const ms = Model.connectedMembers(model, n.id);
      const sp = n.support.type;
      if (sp === 'fixed') out.push(`節點 ${n.id} 固定端：位移 0、轉角 0 → 變形曲線在此與桿軸相切`);
      else if (sp === 'pin') out.push(`節點 ${n.id} 鉸支承：位移 0，可轉動 θ = ${fmtSci(d.rz)} rad`);
      else if (sp === 'roller') out.push(`節點 ${n.id} 滾支承：沿支承面可滑動（Δ = ${fmtSci(Math.hypot(d.ux, d.uy))}），可轉動 θ = ${fmtSci(d.rz)} rad`);
      else if (sp === 'guide') out.push(`節點 ${n.id} 導向支承：轉角 0，可沿導向滑動`);
      if (n.hinge && ms.length >= 2) {
        const rots = ms.map(m => { const mr = res.members[m.id]; if (!mr) return null; return m.n1 === n.id ? mr.ul[2] : mr.ul[5]; }).filter(v => v !== null);
        out.push(`節點 ${n.id} 內鉸：兩側桿端轉角不同（${rots.map(r => fmtSci(r)).join('、')} rad）→ 變形曲線出現折點，M = 0`);
      } else if (!n.hinge && ms.length >= 2 && sp !== 'fixed') {
        const nonTruss = ms.filter(m => !m.truss);
        if (nonTruss.length >= 2) out.push(`節點 ${n.id} 剛接節點：各桿端轉角相同 θ = ${fmtSci(d.rz)} rad，桿件夾角保持不變`);
      }
    }
    for (const id in res.members) {
      const mr = res.members[id];
      if (mr.member.truss) continue;
      const g = mr.geom;
      // 依彎矩符號分段
      const segs = [];
      let cur = null;
      for (const q of mr.pts) {
        const s = q.M > mr.tolM ? 1 : q.M < -mr.tolM ? -1 : 0;
        if (s === 0) continue;
        if (cur && cur.s === s) cur.b = q.x; else { cur = { s, a: q.x, b: q.x }; segs.push(cur); }
      }
      if (!segs.length) { out.push(`桿件 ${id}：M ≈ 0，無彎曲（直線）`); continue; }
      const txt = segs.filter(sg => sg.b - sg.a > 1e-6).map(sg => `x∈[${fmt(sg.a)}, ${fmt(sg.b)}] ${sg.s > 0 ? 'M>0' : 'M<0'}：${sideWord(g, sg.s > 0)}受拉，凹向${sideWord(g, sg.s < 0)}`);
      out.push(`桿件 ${id}：${txt.join('；')}`);
      const infl = mr.keys.filter(k => k.kind === 'mzero');
      if (infl.length) out.push(`桿件 ${id} 反曲點：${infl.map(k => `x = ${fmt(k.x)}`).join('、')}（曲率方向改變）`);
    }
    const ys = nodes.map(n => n.y);
    if (Math.max(...ys) - Math.min(...ys) > 1e-9) {
      let top = null;
      for (const n of nodes) { const d = res.disp[n.id]; if (!top || Math.abs(d.ux) > Math.abs(top.ux)) top = { id: n.id, ux: d.ux }; }
      if (top && Math.abs(top.ux) > 1e-15) out.push(`側移：最大水平位移在節點 ${top.id}，Δ = ${fmtSci(top.ux)}（剛架受側力或不對稱載重時產生側移；同一樓層各柱頂水平位移相近）`);
    }
    return out;
  }

  // ---- 桁架：零桿判定三法則（幾何判定，逐輪移除已判定的零桿）----
  function zeroMembers(model, res) {
    if (!res.classification.allTruss) return null;
    const tol = 1e-8 * Math.max(1, res.maxAbsN || 1);
    const active = new Set(model.members.map(m => m.id));
    const found = {};
    const dirAt = (m, nd) => { const o = Model.node(model, m.n1 === nd.id ? m.n2 : m.n1); const d = Math.hypot(o.x - nd.x, o.y - nd.y) || 1; return [(o.x - nd.x) / d, (o.y - nd.y) / d]; };
    const along = (a, b) => Math.abs(Math.abs(a[0] * b[0] + a[1] * b[1]) - 1) < 1e-6;
    const steps = [];
    let round = 0, changed = true;
    const mark = (m, rule, nd, reason) => {
      found[m.id] = { rule, node: nd.id, round, reason };
      active.delete(m.id); changed = true;
      steps.push(`第 ${round} 輪：桿 ${m.id} 為零桿 —— 法則 ${rule}（節點 ${nd.id}：${reason}）`);
    };
    while (changed && round < 50) {
      changed = false; round++;
      for (const nd of model.nodes) {
        const ms = model.members.filter(m => active.has(m.id) && (m.n1 === nd.id || m.n2 === nd.id));
        if (!ms.length) continue;
        const sp = nd.support.type;
        if (sp === 'pin' || sp === 'fixed' || sp === 'spring' || sp === 'guide') continue; // 反力方向未知
        const known = [];
        const F = [nd.loads.fx, nd.loads.fy];
        if (Math.hypot(F[0], F[1]) > 1e-12) { const d = Math.hypot(F[0], F[1]); known.push({ d: [F[0] / d, F[1] / d], what: '外力' }); }
        if (sp === 'roller') { const th = nd.support.angle * Math.PI / 180; known.push({ d: [-Math.sin(th), Math.cos(th)], what: '滾支承反力' }); }
        if (known.length > 1) continue;
        const dirs = ms.map(m => dirAt(m, nd));
        if (ms.length === 1) { if (!known.length) mark(ms[0], 1, nd, '僅連一桿且無外力'); continue; }
        if (ms.length === 2) {
          if (along(dirs[0], dirs[1])) continue; // 共線兩桿：內力相等，不為零
          if (!known.length) { mark(ms[0], 1, nd, '僅連兩根不共線桿件且無外力'); mark(ms[1], 1, nd, '僅連兩根不共線桿件且無外力'); }
          else if (along(dirs[0], known[0].d)) mark(ms[1], 3, nd, `${known[0].what}沿桿 ${ms[0].id} 方向，另一桿為零`);
          else if (along(dirs[1], known[0].d)) mark(ms[0], 3, nd, `${known[0].what}沿桿 ${ms[1].id} 方向，另一桿為零`);
        } else if (ms.length === 3) {
          let pair = null;
          for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (along(dirs[i], dirs[j])) pair = [i, j];
          if (!pair) continue;
          const k = [0, 1, 2].find(i => !pair.includes(i));
          if (!known.length) mark(ms[k], 2, nd, `三桿中桿 ${ms[pair[0]].id}、${ms[pair[1]].id} 共線且無外力，第三桿為零`);
          else if (along(dirs[pair[0]], known[0].d)) mark(ms[k], 2, nd, `${known[0].what}沿共線桿方向，第三桿為零`);
        }
      }
    }
    const computedOnly = [];
    for (const id in res.members) {
      const mr = res.members[id];
      if (!found[id] && Math.abs(mr.maxN.N) < tol && Math.abs(mr.minN.N) < tol) computedOnly.push(+id);
    }
    return { found, steps, computedOnly, rounds: round - 1 };
  }

  // ---- 桁架：截面法 ----
  // line: {x1,y1,x2,y2,side:'L'|'R'}（以無限延伸的直線分割）
  function sectionCut(model, res, line) {
    if (!line) return null;
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
    if (Math.hypot(dx, dy) < 1e-9) return null;
    const sideOf = (x, y) => (dx * (y - line.y1) - dy * (x - line.x1)) > 0 ? 'L' : 'R';
    const side = line.side || 'L';
    const partNodes = new Set(model.nodes.filter(n => sideOf(n.x, n.y) === side).map(n => n.id));
    const cut = [], inner = [];
    for (const m of model.members) {
      const a = partNodes.has(m.n1), b = partNodes.has(m.n2);
      if (a && b) inner.push(m.id);
      else if (a || b) {
        const near = Model.node(model, a ? m.n1 : m.n2), far = Model.node(model, a ? m.n2 : m.n1);
        const L = Math.hypot(far.x - near.x, far.y - near.y) || 1;
        const u = [(far.x - near.x) / L, (far.y - near.y) / L];
        // 與切割線交點
        const den = u[0] * dy - u[1] * dx;
        let t = Math.abs(den) > 1e-12 ? ((line.x1 - near.x) * dy - (line.y1 - near.y) * dx) / den : L / 2;
        t = Math.max(0, Math.min(L, t));
        const mr = res.members[m.id];
        const N = mr ? mr.fns.at(L / 2).N : 0;
        cut.push({ id: m.id, N, q: [near.x + u[0] * t, near.y + u[1] * t], u, near: near.id, far: far.id, truss: m.truss, a: near, b: far });
      }
    }
    const ext = [];
    for (const id of partNodes) {
      const n = Model.node(model, id);
      if (n.loads.fx || n.loads.fy) ext.push({ node: id, x: n.x, y: n.y, fx: n.loads.fx, fy: n.loads.fy, kind: '外力' });
      const r = res.reactions[id];
      if (r && (Math.abs(r.fx) > 1e-9 || Math.abs(r.fy) > 1e-9)) ext.push({ node: id, x: n.x, y: n.y, fx: r.fx, fy: r.fy, kind: '反力' });
    }
    let sx = 0, sy = 0;
    for (const e of ext) { sx += e.fx; sy += e.fy; }
    for (const c of cut) { sx += c.N * c.u[0]; sy += c.N * c.u[1]; }
    const f = fmt;
    const suggestions = [];
    const lineOf = c => ({ p: [c.a.x, c.a.y], u: c.u });
    const intersect = (A, B) => { const den = A.u[0] * B.u[1] - A.u[1] * B.u[0]; if (Math.abs(den) < 1e-9) return null; const t = ((B.p[0] - A.p[0]) * B.u[1] - (B.p[1] - A.p[1]) * B.u[0]) / den; return [A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t]; };
    if (cut.length === 3) {
      for (let k = 0; k < 3; k++) {
        const c = cut[k], others = cut.filter((_, i) => i !== k);
        const P = intersect(lineOf(others[0]), lineOf(others[1]));
        if (P) {
          let Mext = 0;
          for (const e of ext) Mext += (e.x - P[0]) * e.fy - (e.y - P[1]) * e.fx;
          const arm = (c.q[0] - P[0]) * c.u[1] - (c.q[1] - P[1]) * c.u[0];
          if (Math.abs(arm) > 1e-9) suggestions.push({ member: c.id, P, text: `求桿 ${c.id}：對桿 ${others[0].id}、${others[1].id} 的交點 P(${f(P[0])}, ${f(P[1])}) 取矩 → 外力矩 ΣM_P = ${f(Mext)}，桿 ${c.id} 單位力的力臂 = ${f(arm)} → N = −${f(Mext)}/${f(arm)} = ${f(-Mext / arm)}${c.truss ? '' : '（非桁架桿，另有剪力與彎矩）'}` });
          else suggestions.push({ member: c.id, P, text: `桿 ${c.id} 亦通過 P，三桿共點 → 改用力平衡` });
        } else {
          const n = [-others[0].u[1], others[0].u[0]];
          let Fn = 0;
          for (const e of ext) Fn += e.fx * n[0] + e.fy * n[1];
          const proj = c.u[0] * n[0] + c.u[1] * n[1];
          suggestions.push({ member: c.id, text: `求桿 ${c.id}：桿 ${others[0].id}、${others[1].id} 平行 → 取垂直於它們的力平衡：外力分量 ${f(Fn)} + N×${f(proj)} = 0 → N = ${f(-Fn / proj)}` });
        }
      }
    } else if (cut.length === 2) {
      suggestions.push({ text: `只切到 2 根桿件：以 ΣFx = 0、ΣFy = 0 兩式即可求出兩桿內力` });
    } else if (cut.length > 3) {
      suggestions.push({ text: `切割線穿過 ${cut.length} 根桿件，超過 3 個平衡式可解的數量；請改畫切割線，或先用零桿判定減少未知數` });
    } else if (cut.length === 1) {
      suggestions.push({ text: '只切到 1 根桿件' });
    }
    // 以位置描述取用側（左半／右半／上半／下半）
    let partLabel = side === 'L' ? '左側' : '右側';
    const other = model.nodes.filter(n => !partNodes.has(n.id));
    if (partNodes.size && other.length) {
      const cen = arr => [arr.reduce((s, n) => s + n.x, 0) / arr.length, arr.reduce((s, n) => s + n.y, 0) / arr.length];
      const a = cen(model.nodes.filter(n => partNodes.has(n.id))), b = cen(other);
      const ddx = a[0] - b[0], ddy = a[1] - b[1];
      partLabel = Math.abs(ddx) >= Math.abs(ddy) ? (ddx < 0 ? '左半部' : '右半部') : (ddy > 0 ? '上半部' : '下半部');
    }
    return { side, partLabel, partNodes, inner, cut, ext, sums: { fx: sx, fy: sy }, suggestions };
  }

  // ---- 桁架：載重上限（線性比例法）----
  function loadLimit(model, res, opts) {
    const { allowT, allowC, eulerK } = opts;
    const items = [];
    for (const id in res.members) {
      const mr = res.members[id];
      const N = Math.abs(mr.maxN.N) > Math.abs(mr.minN.N) ? mr.maxN.N : mr.minN.N;
      if (Math.abs(N) < 1e-9) continue;
      if (N > 0) { if (allowT > 0) items.push({ id: +id, N, type: '拉', limit: allowT, lambda: allowT / N, how: `拉力容許 ${fmt(allowT)}` }); }
      else {
        const cands = [];
        if (allowC > 0) cands.push({ limit: allowC, how: `壓力容許 ${fmt(allowC)}` });
        if (eulerK > 0) { const L = mr.geom.L, Pcr = Math.PI ** 2 * mr.E * mr.I / (eulerK * L) ** 2; cands.push({ limit: Pcr, how: `尤拉挫屈 Pcr = π²EI/(KL)² = ${fmtSci(Pcr)}` }); }
        if (!cands.length) continue;
        const best = cands.reduce((a, b) => (a.limit < b.limit ? a : b));
        items.push({ id: +id, N, type: '壓', limit: best.limit, lambda: best.limit / -N, how: best.how });
      }
    }
    if (!items.length) return null;
    items.sort((a, b) => a.lambda - b.lambda);
    let refP = 0;
    for (const n of model.nodes) refP = Math.max(refP, Math.hypot(n.loads.fx, n.loads.fy));
    for (const m of model.members) for (const ld of m.loads) if (ld.type === 'point') refP = Math.max(refP, Math.abs(ld.P));
    return { items, lambda: items[0].lambda, controlling: items[0], refP };
  }

  // ---- 連續梁：跨度偵測、活載重配置、包絡線 ----
  function continuousBeam(model) {
    const nodes = model.nodes.filter(n => Model.connectedMembers(model, n.id).length);
    if (nodes.length < 3 || !model.members.length) return null;
    const y0 = nodes[0].y;
    if (!nodes.every(n => Math.abs(n.y - y0) < 1e-9)) return null;
    if (model.members.some(m => m.truss) || nodes.some(n => n.hinge)) return null;
    const sups = nodes.filter(n => n.support.type !== 'none' && n.support.type !== 'spring').sort((a, b) => a.x - b.x);
    if (sups.length < 3) return null;
    const midx = m => { const g = Model.memberGeom(model, m); return (g.x1 + g.x2) / 2; };
    const spans = [];
    const leftOver = model.members.filter(m => midx(m) < sups[0].x);
    if (leftOver.length) spans.push({ label: '左懸臂', xa: Math.min(...leftOver.map(m => Math.min(Model.memberGeom(model, m).x1, Model.memberGeom(model, m).x2))), xb: sups[0].x, members: leftOver.map(m => m.id), cant: true });
    for (let i = 0; i + 1 < sups.length; i++) {
      const ms = model.members.filter(m => midx(m) > sups[i].x && midx(m) < sups[i + 1].x);
      spans.push({ label: `第 ${i + 1} 跨`, xa: sups[i].x, xb: sups[i + 1].x, members: ms.map(m => m.id), cant: false, left: sups[i].id, right: sups[i + 1].id });
    }
    const rightOver = model.members.filter(m => midx(m) > sups[sups.length - 1].x);
    if (rightOver.length) spans.push({ label: '右懸臂', xa: sups[sups.length - 1].x, xb: Math.max(...rightOver.map(m => Math.max(Model.memberGeom(model, m).x1, Model.memberGeom(model, m).x2))), members: rightOver.map(m => m.id), cant: true });
    return { spans, supports: sups };
  }

  // 依配置覆寫靜載／活載（以 tag 區分，不影響使用者自行加的載重）
  function setLivePattern(model, cb, wD, wL, pattern) {
    for (const m of model.members) m.loads = m.loads.filter(l => !l.tag);
    cb.spans.forEach((sp, i) => {
      for (const id of sp.members) {
        const m = Model.member(model, id); const g = Model.memberGeom(model, m);
        if (wD > 0) m.loads.push({ type: 'udl', a: 0, b: g.L, w1: wD, w2: wD, dir: 'global', tag: 'dead' });
        if (pattern[i] && wL > 0) m.loads.push({ type: 'udl', a: 0, b: g.L, w1: wL, w2: wL, dir: 'global', tag: 'live' });
      }
    });
  }
  // 第 i 跨最大正彎矩：該跨及其隔跨配置
  function patternSpanMax(cb, i) { return cb.spans.map((_, j) => Math.abs(j - i) % 2 === 0); }
  // 支承（跨 j−1 與跨 j 之間）最大負彎矩：相鄰兩跨及其隔跨配置
  function patternSupportMax(cb, j) { return cb.spans.map((_, s) => (s < j ? (j - 1 - s) % 2 === 0 : (s - j) % 2 === 0)); }

  function envelope(model, cb, wD, wL) {
    const n = cb.spans.length;
    if (n > 8) return null;
    const base = Analysis.run(model);
    if (!base.ok) return null;
    const members = {};
    for (const id in base.members) members[id] = { xs: base.members[id].pts.map(p => p.x), max: base.members[id].pts.map(() => -Infinity), min: base.members[id].pts.map(() => Infinity) };
    const spanMax = cb.spans.map(() => ({ M: -Infinity, x: 0, pattern: null }));
    const supMin = cb.supports.map(() => ({ M: Infinity, pattern: null }));
    const total = 1 << n;
    for (let p = 0; p < total; p++) {
      const pattern = cb.spans.map((_, i) => !!(p & (1 << i)));
      const mc = Model.clone(model);
      setLivePattern(mc, cb, wD, wL, pattern);
      const res = Solver.analyze(mc);
      if (!res.ok) continue;
      const sm = {};
      for (const id in res.members) {
        const s = sampleMember(res.members[id]); sm[id] = s;
        const e = members[id];
        s.pts.forEach((q, k) => { if (q.M > e.max[k]) e.max[k] = q.M; if (q.M < e.min[k]) e.min[k] = q.M; });
      }
      cb.spans.forEach((sp, i) => { for (const id of sp.members) { const s = sm[id]; if (s && s.maxM.M > spanMax[i].M) spanMax[i] = { M: s.maxM.M, x: s.maxM.x, member: +id, pattern }; } });
      cb.supports.forEach((nd, j) => {
        let M = 0;
        for (const id in res.members) { const mr = res.members[id]; if (mr.member.n1 === nd.id) { M = sm[id].fns.right(0).M; break; } if (mr.member.n2 === nd.id) { M = sm[id].fns.left(mr.geom.L).M; break; } }
        if (M < supMin[j].M) supMin[j] = { M, pattern };
      });
    }
    return { members, spanMax, supMin, count: total };
  }

  // ---- 非載重效應（支承沉陷、溫度）：各連通結構分別判別並比較 ----
  function nonLoadEffects(model) {
    const hasSettle = model.nodes.some(n => n.support.type !== 'none' && (n.settle.dx || n.settle.dy || n.settle.rz));
    const hasTemp = model.members.some(m => m.loads.some(l => l.type === 'temp' && (l.dT || (l.dTd && l.h))));
    if (!hasSettle && !hasTemp) return null;
    // 連通元件
    const parent = new Map(); model.nodes.forEach(n => parent.set(n.id, n.id));
    const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    for (const m of model.members) parent.set(find(m.n1), find(m.n2));
    const groups = new Map();
    for (const m of model.members) { const r = find(m.n1); if (!groups.has(r)) groups.set(r, new Set()); groups.get(r).add(m.n1); groups.get(r).add(m.n2); }
    const comps = [];
    let idx = 0;
    for (const [, nodeSet] of groups) {
      idx++;
      const sub = Model.clone(model);
      sub.nodes = sub.nodes.filter(n => nodeSet.has(n.id));
      sub.members = sub.members.filter(m => nodeSet.has(m.n1));
      for (const n of sub.nodes) n.loads = { fx: 0, fy: 0, m: 0 };
      for (const m of sub.members) m.loads = m.loads.filter(l => l.type === 'temp');
      const effects = [];
      for (const n of sub.nodes) if (n.support.type !== 'none' && (n.settle.dx || n.settle.dy || n.settle.rz)) effects.push(`節點 ${n.id} 沉陷 (${fmt(n.settle.dx)}, ${fmt(n.settle.dy)})`);
      for (const m of sub.members) for (const l of m.loads) { if (l.dT) effects.push(`桿 ${m.id} 升溫 ${fmt(l.dT)}°C`); if (l.dTd && l.h) effects.push(`桿 ${m.id} 溫差 ${fmt(l.dTd)}°C`); }
      if (!effects.length) continue;
      const res = run(sub);
      const xs = sub.nodes.map(n => n.x), ys = sub.nodes.map(n => n.y);
      const where = `x ${fmt(Math.min(...xs))}~${fmt(Math.max(...xs))}、y ${fmt(Math.min(...ys))}~${fmt(Math.max(...ys))}`;
      comps.push({ idx, where, nodes: [...nodeSet], effects, cls: res.classification, unstable: res.unstable, M: res.ok ? res.maxAbsM : 0, N: res.ok ? res.maxAbsN : 0, V: res.ok ? res.maxAbsV : 0, disp: res.ok ? res.maxDisp : 0, reactions: res.ok ? Object.values(res.reactions).reduce((a, r) => Math.max(a, Math.hypot(r.fx, r.fy), Math.abs(r.m)), 0) : 0 });
    }
    return comps.length ? { comps, hasSettle, hasTemp } : null;
  }

  // ---- A/B 比較：結構差異與結果摘要 ----
  function compare(mA, rA, mB, rB) {
    const diffs = [];
    const nodesA = new Map(mA.nodes.map(n => [n.id, n])), nodesB = new Map(mB.nodes.map(n => [n.id, n]));
    const label = t => Solver.SUPPORT_INFO[t] ? Solver.SUPPORT_INFO[t].label : t;
    for (const [id, a] of nodesA) {
      const b = nodesB.get(id);
      if (!b) { diffs.push(`移除節點 ${id}`); continue; }
      if (a.support.type !== b.support.type) diffs.push(`節點 ${id} 支承：${label(a.support.type)} → ${label(b.support.type)}`);
      else if (a.support.type !== 'none' && Math.abs(a.support.angle - b.support.angle) > 1e-9) diffs.push(`節點 ${id} 支承傾角：${fmt(a.support.angle)}° → ${fmt(b.support.angle)}°`);
      if (a.hinge !== b.hinge) diffs.push(`節點 ${id} ${b.hinge ? '加入' : '移除'}內鉸`);
      if (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9) diffs.push(`節點 ${id} 位置 (${fmt(a.x)}, ${fmt(a.y)}) → (${fmt(b.x)}, ${fmt(b.y)})`);
      if (a.loads.fx !== b.loads.fx || a.loads.fy !== b.loads.fy || a.loads.m !== b.loads.m) diffs.push(`節點 ${id} 節點載重改變`);
    }
    for (const [id] of nodesB) if (!nodesA.has(id)) diffs.push(`新增節點 ${id}`);
    const memA = new Map(mA.members.map(m => [m.id, m])), memB = new Map(mB.members.map(m => [m.id, m]));
    for (const [id, a] of memA) {
      const b = memB.get(id);
      if (!b) { diffs.push(`移除桿件 ${id}`); continue; }
      if (a.truss !== b.truss) diffs.push(`桿件 ${id} ${b.truss ? '改為桁架桿' : '改為剛架桿'}`);
      if (a.release1 !== b.release1 || a.release2 !== b.release2) diffs.push(`桿件 ${id} 桿端釋放改變`);
      if (JSON.stringify(a.loads) !== JSON.stringify(b.loads)) diffs.push(`桿件 ${id} 載重改變`);
      if (a.E !== b.E || a.I !== b.I || a.A !== b.A) diffs.push(`桿件 ${id} 斷面／材料改變`);
    }
    for (const [id] of memB) if (!memA.has(id)) diffs.push(`新增桿件 ${id}`);
    const summary = r => {
      if (!r) return null;
      const cl = r.classification;
      const s = { det: r.unstable ? '不穩定（幾何）' : cl.text, n: cl.n, r: cl.r, c: cl.c, ok: r.ok };
      if (r.ok) {
        let Mmax = -Infinity, Mmin = Infinity, Vmax = 0, Nmax = -Infinity, Nmin = Infinity;
        for (const id in r.members) { const mr = r.members[id]; Mmax = Math.max(Mmax, mr.maxM.M); Mmin = Math.min(Mmin, mr.minM.M); Vmax = Math.max(Vmax, Math.abs(mr.maxV.V), Math.abs(mr.minV.V)); Nmax = Math.max(Nmax, mr.maxN.N); Nmin = Math.min(Nmin, mr.minN.N); }
        Object.assign(s, { Mmax, Mmin, Vmax, Nmax, Nmin, disp: r.maxDisp, reactions: r.reactions });
      }
      return s;
    };
    return { diffs, A: summary(rA), B: summary(rB) };
  }

  // 完整分析
  function run(model) {
    const res = Solver.analyze(model);
    if (!res.ok) return res;
    const members = {};
    let maxAbsV = 0, maxAbsM = 0, maxAbsN = 0, maxDisp = 0;
    const alpha = model.settings.alpha;
    for (const id in res.members) {
      const mr = res.members[id];
      const sm = sampleMember(mr);
      const df = deflection(mr, sm.fns, alpha);
      members[id] = { ...mr, ...sm, defl: df };
      maxAbsV = Math.max(maxAbsV, sm.maxAbsV); maxAbsM = Math.max(maxAbsM, sm.maxAbsM); maxAbsN = Math.max(maxAbsN, sm.maxAbsN);
      for (let i = 0; i < df.xs.length; i++) maxDisp = Math.max(maxDisp, Math.hypot(df.u[i], df.v[i]));
    }
    for (const id in res.disp) { const d = res.disp[id]; maxDisp = Math.max(maxDisp, Math.hypot(d.ux, d.uy)); }
    const std = standardCases(model, res);
    const full = { ...res, members, maxAbsV, maxAbsM, maxAbsN, maxDisp, standard: std };
    try { full.funicular = funicular(model, full); } catch (e) { console.error(e); full.funicular = null; }
    try { full.deformNotes = deformNotes(model, full); } catch (e) { console.error(e); full.deformNotes = []; }
    try { full.zero = zeroMembers(model, full); } catch (e) { console.error(e); full.zero = null; }
    return full;
  }

  return { run, memberFunctions, sampleMember, deflection, features, standardCases, funicular, deformNotes, nodeMoment, zeroMembers, sectionCut, loadLimit, continuousBeam, setLivePattern, patternSpanMax, patternSupportMax, envelope, nonLoadEffects, compare, fmt, fmtSci };
})();
