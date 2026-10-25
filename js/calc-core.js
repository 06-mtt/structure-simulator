// 小計算器核心（純計算，供 calculators.html 與 tests 使用）
const CalcCore = (() => {
  // ---- 斷面性質 ----
  // 以矩形組合計算：parts = [{b, h, y}]  y = 矩形底邊距基準線高度；b 可為負（挖空）
  function compositeSection(parts) {
    let A = 0, Ay = 0;
    const rows = parts.map(p => { const a = p.b * p.h, yc = p.y + p.h / 2; A += a; Ay += a * yc; return { ...p, A: a, yc, Ay: a * yc, I0: p.b * p.h ** 3 / 12 }; });
    const ybar = Ay / A;
    let I = 0;
    for (const r of rows) { r.d = r.yc - ybar; r.Ad2 = r.A * r.d * r.d; I += r.I0 + r.Ad2; }
    const ymin = Math.min(...parts.map(p => p.y)), ymax = Math.max(...parts.map(p => p.y + p.h));
    const h = ymax - ymin;
    const ytop = ymax - ybar, ybot = ybar - ymin;
    // 中性軸處的一次矩 Q 與寬度 b（取中性軸以上部分）
    let Q = 0, bNA = 0;
    for (const p of parts) {
      const lo = Math.max(p.y, ybar), hi = p.y + p.h;
      if (hi > lo) Q += p.b * (hi - lo) * ((hi + lo) / 2 - ybar);
      if (p.y <= ybar && p.y + p.h >= ybar) bNA += p.b;
    }
    return { A, ybar, I, h, ytop, ybot, Stop: I / ytop, Sbot: I / ybot, r: Math.sqrt(I / A), Q, bNA, rows, composite: true };
  }
  function section(shape, p) {
    switch (shape) {
      case 'rect': return { ...compositeSection([{ b: p.b, h: p.h, y: 0 }]), formula: ['I = bh³/12', 'S = bh²/6', 'r = h/√12 ≈ 0.289h', 'τmax = 1.5V/A'] };
      case 'hollowRect': return { ...compositeSection([{ b: p.b, h: p.h, y: 0 }, { b: -p.bi, h: p.hi, y: (p.h - p.hi) / 2 }]), formula: ['I = (BH³ − bh³)/12（同心時）'] };
      case 'I': {
        const hw = p.h - 2 * p.tf;
        return { ...compositeSection([{ b: p.bf, h: p.tf, y: 0 }, { b: p.tw, h: hw, y: p.tf }, { b: p.bf, h: p.tf, y: p.h - p.tf }]), formula: ['I = [b_f h³ − (b_f − t_w)(h − 2t_f)³]/12', '翼板貢獻大部分 I（平行軸項 A·d²）'] };
      }
      case 'T': return { ...compositeSection([{ b: p.tw, h: p.h - p.tf, y: 0 }, { b: p.bf, h: p.tf, y: p.h - p.tf }]), formula: ['先求形心 ȳ = ΣAy/ΣA，再用平行軸定理 I = Σ(I₀ + A d²)', '非對稱：S_top ≠ S_bot，應力以距形心較遠側為大'] };
      case 'channel': return { ...compositeSection([{ b: p.bf, h: p.tf, y: 0 }, { b: p.tw, h: p.h - 2 * p.tf, y: p.tf }, { b: p.bf, h: p.tf, y: p.h - p.tf }]), formula: ['對水平軸對稱，與同尺寸 I 型相同'] };
      case 'circle': {
        const d = p.d, A = Math.PI * d * d / 4, I = Math.PI * d ** 4 / 64;
        return { A, ybar: d / 2, I, h: d, ytop: d / 2, ybot: d / 2, Stop: I / (d / 2), Sbot: I / (d / 2), r: d / 4, Q: d ** 3 / 12, bNA: d, formula: ['A = πd²/4', 'I = πd⁴/64', 'S = πd³/32', 'r = d/4', 'τmax = 4V/(3A)'] };
      }
      case 'pipe': {
        const d = p.d, di = p.di, A = Math.PI * (d * d - di * di) / 4, I = Math.PI * (d ** 4 - di ** 4) / 64;
        return { A, ybar: d / 2, I, h: d, ytop: d / 2, ybot: d / 2, Stop: I / (d / 2), Sbot: I / (d / 2), r: Math.sqrt(I / A), Q: (d ** 3 - di ** 3) / 12, bNA: d - di, formula: ['I = π(D⁴ − d⁴)/64', 'r = √((D² + d²))/4'] };
      }
      case 'custom': return { ...compositeSection(p.parts), formula: ['ȳ = ΣA_i y_i / ΣA_i', 'I = Σ(I₀ᵢ + A_i d_i²)（平行軸定理）'] };
    }
    return null;
  }
  // 彎曲與剪應力
  function stresses(sec, M, V) {
    const sTop = -M / sec.Stop, sBot = M / sec.Sbot; // M 正（下側受拉）→ 頂壓底拉
    const tau = sec.bNA > 0 ? V * sec.Q / (sec.I * sec.bNA) : 0;
    return { sTop, sBot, tau, tauAvg: V / sec.A };
  }

  // ---- 分段軸力桿 ----
  // segs: [{L, A, E}]（由左而右），P: 節點 1..n 的軸向力（向右為正；節點 0 為左端支承），rightFixed: 右端是否固定
  function axialBar(segs, P, rightFixed) {
    const n = segs.length;
    const flex = segs.map(s => s.L / (s.E * s.A));
    // 左端固定、右端自由：N_i = Σ_{j≥i} P_j
    const Nfree = segs.map((_, i) => P.slice(i).reduce((a, b) => a + b, 0));
    let R = 0;
    if (rightFixed) {
      // 相容：Σ N_i L_i/(EA)_i = 0 → R = −Σ Nfree_i f_i / Σ f_i
      R = -Nfree.reduce((a, N, i) => a + N * flex[i], 0) / flex.reduce((a, b) => a + b, 0);
    }
    const N = Nfree.map(v => v + R);
    const delta = N.map((v, i) => v * flex[i]);
    const u = [0];
    for (let i = 0; i < n; i++) u.push(u[i] + delta[i]);
    const RL = -N[0]; // 左端反力（向右為正）
    return { N, delta, u, R, RL, flex, total: u[n], Nfree };
  }

  // ---- 柱側向勁度與週期 ----
  // cols: [{E, I, h, fixity:'fixed'|'pinned'}]；V 樓層剪力；mass 質量（t = kN·s²/m）
  function storyStiffness(cols, V, mass) {
    const items = cols.map(c => { const coef = c.fixity === 'pinned' ? 3 : 12; const k = coef * c.E * c.I / c.h ** 3; return { ...c, coef, k }; });
    const K = items.reduce((a, c) => a + c.k, 0);
    items.forEach(c => { c.share = K > 0 ? c.k / K : 0; c.V = V * c.share; c.M = c.fixity === 'pinned' ? c.V * c.h : c.V * c.h / 2; });
    const drift = K > 0 ? V / K : 0;
    const T = K > 0 && mass > 0 ? 2 * Math.PI * Math.sqrt(mass / K) : 0;
    return { items, K, drift, T, f: T > 0 ? 1 / T : 0 };
  }
  // 規範經驗週期（速記）：T = C·H^0.75
  function empiricalPeriod(H) { return { rc: 0.07 * H ** 0.75, steel: 0.085 * H ** 0.75, other: 0.05 * H ** 0.75 }; }

  // ---- 柱挫屈 ----
  const END_CONDITIONS = [
    { key: 'pp', label: '兩端鉸接', K: 1.0 },
    { key: 'ff', label: '兩端固定', K: 0.5 },
    { key: 'fp', label: '一端固定一端鉸接', K: 0.7 },
    { key: 'fg', label: '一端固定一端導向（可平移不轉）', K: 1.0 },
    { key: 'ffree', label: '一端固定一端自由（懸臂）', K: 2.0 },
  ];
  function buckling(E, I, A, L, sigmaY) {
    const r = Math.sqrt(I / A);
    const rows = END_CONDITIONS.map(ec => {
      const Le = ec.K * L, Pcr = Math.PI ** 2 * E * I / (Le * Le), lambda = Le / r, scr = Pcr / A;
      return { ...ec, Le, Pcr, lambda, scr, elastic: sigmaY > 0 ? scr <= sigmaY : true };
    });
    const lambdaLimit = sigmaY > 0 ? Math.PI * Math.sqrt(E / sigmaY) : 0;
    return { r, rows, lambdaLimit };
  }

  return { section, compositeSection, stresses, axialBar, storyStiffness, empiricalPeriod, buckling, END_CONDITIONS };
})();
