// 二維剛架直接勁度法求解器：支援桿端釋放（內鉸）、桁架桿、斜向支承、彈簧支承、支承沉陷、溫度
const Solver = (() => {
  const SUPPORT_INFO = {
    none:   { label: '無',       fixed: [],        r: 0 },
    pin:    { label: '鉸支承',   fixed: [0, 1],    r: 2 },
    roller: { label: '滾支承',   fixed: [1],       r: 1 },
    fixed:  { label: '固定支承', fixed: [0, 1, 2], r: 3 },
    guide:  { label: '導向支承', fixed: [1, 2],    r: 2 },
    spring: { label: '彈簧支承', fixed: [],        r: 0 },
  };

  function localStiffness(E, A, I, L) {
    const a = E * A / L, b = E * I / (L * L * L);
    return [
      [a, 0, 0, -a, 0, 0],
      [0, 12 * b, 6 * b * L, 0, -12 * b, 6 * b * L],
      [0, 6 * b * L, 4 * b * L * L, 0, -6 * b * L, 2 * b * L * L],
      [-a, 0, 0, a, 0, 0],
      [0, -12 * b, -6 * b * L, 0, 12 * b, -6 * b * L],
      [0, 6 * b * L, 2 * b * L * L, 0, -6 * b * L, 4 * b * L * L],
    ];
  }
  // 局部 = T · 整體
  function transform(c, s) {
    return [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1],
    ];
  }

  // 把桿件載重轉成局部座標的載重清單
  // point: {x, px, py}  couple: {x, C}(逆時針正)  dist: {a,b,qx1,qx2,qy1,qy2}(沿局部軸正向)  temp: {dT}
  function localLoads(m, g) {
    const out = [];
    const { c, s, L } = g;
    for (const ld of m.loads) {
      if (ld.type === 'point') {
        const th = ld.angle * Math.PI / 180;
        const Fx = ld.P * Math.cos(th), Fy = ld.P * Math.sin(th);
        out.push({ kind: 'point', x: ld.pos, px: c * Fx + s * Fy, py: -s * Fx + c * Fy, src: ld });
      } else if (ld.type === 'moment') {
        out.push({ kind: 'couple', x: ld.pos, C: ld.M, src: ld });
      } else if (ld.type === 'udl') {
        if (ld.b - ld.a < 1e-9) continue;
        let f = 1;
        if (ld.dir === 'projected') f = Math.abs(c);
        if (ld.dir === 'local') {
          out.push({ kind: 'dist', a: ld.a, b: ld.b, qx1: 0, qx2: 0, qy1: -ld.w1, qy2: -ld.w2, src: ld });
        } else {
          // 整體向下的載重 (0, -w)
          out.push({ kind: 'dist', a: ld.a, b: ld.b, qx1: -s * ld.w1 * f, qx2: -s * ld.w2 * f, qy1: -c * ld.w1 * f, qy2: -c * ld.w2 * f, src: ld });
        }
      } else if (ld.type === 'temp') {
        out.push({ kind: 'temp', dT: ld.dT || 0, dTd: ld.dTd || 0, h: ld.h || 0, src: ld });
      }
    }
    return out;
  }

  // 固定端力（支承作用於桿件的力，局部座標）
  function fixedEndForces(L, loads, E, A, alpha, I = 0) {
    const R = [0, 0, 0, 0, 0, 0];
    const GP = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)], GW = [5 / 9, 8 / 9, 5 / 9];
    for (const ld of loads) {
      if (ld.kind === 'point') {
        const a = ld.x, b = L - a;
        R[0] += -ld.px * b / L; R[3] += -ld.px * a / L;
        const M1 = -ld.py * a * b * b / (L * L), M2 = ld.py * a * a * b / (L * L);
        const Fy2 = -(M1 + M2 + ld.py * a) / L, Fy1 = -ld.py - Fy2;
        R[1] += Fy1; R[2] += M1; R[4] += Fy2; R[5] += M2;
      } else if (ld.kind === 'couple') {
        const a = ld.x, b = L - a, C = ld.C;
        const M1 = C * b * (2 * a - b) / (L * L), M2 = C * a * (2 * b - a) / (L * L);
        const Fy2 = -(M1 + M2 + C) / L, Fy1 = -Fy2;
        R[1] += Fy1; R[2] += M1; R[4] += Fy2; R[5] += M2;
      } else if (ld.kind === 'dist') {
        const { a, b } = ld, h = (b - a) / 2, mid = (a + b) / 2;
        let M1 = 0, M2 = 0, Qy = 0, Qys = 0;
        for (let i = 0; i < 3; i++) {
          const sPt = mid + h * GP[i], w = GW[i] * h;
          const t = (sPt - a) / (b - a);
          const qx = ld.qx1 + (ld.qx2 - ld.qx1) * t, qy = ld.qy1 + (ld.qy2 - ld.qy1) * t;
          R[0] += -qx * (L - sPt) / L * w; R[3] += -qx * sPt / L * w;
          M1 += -qy * sPt * (L - sPt) * (L - sPt) / (L * L) * w;
          M2 += qy * sPt * sPt * (L - sPt) / (L * L) * w;
          Qy += qy * w; Qys += qy * sPt * w;
        }
        const Fy2 = -(M1 + M2 + Qys) / L, Fy1 = -Qy - Fy2;
        R[1] += Fy1; R[2] += M1; R[4] += Fy2; R[5] += M2;
      } else if (ld.kind === 'temp') {
        const F = E * A * alpha * ld.dT;
        R[0] += F; R[3] -= F;
        // 溫差梯度：自由曲率 κ0 = α·ΔT_d/h（底面較熱 → 凹向上）；完全束制時產生負彎矩 −EIκ0
        if (ld.h > 0 && ld.dTd) { const Mk = E * I * alpha * ld.dTd / ld.h; R[2] += Mk; R[5] -= Mk; }
      }
    }
    return R;
  }

  function rotRestrained(nd) {
    const t = nd.support.type;
    return t === 'fixed' || t === 'guide' || (t === 'spring' && nd.support.kr > 0);
  }

  // 計算每根桿件兩端的有效釋放（含內鉸規則）
  function effectiveReleases(model) {
    const rel = {};
    for (const m of model.members) rel[m.id] = [!!m.release1 || !!m.truss, !!m.release2 || !!m.truss];
    for (const nd of model.nodes) {
      if (!nd.hinge) continue;
      const ends = [];
      for (const m of model.members) {
        if (m.n1 === nd.id) ends.push([m.id, 0]);
        if (m.n2 === nd.id) ends.push([m.id, 1]);
      }
      const all = rotRestrained(nd) || nd.loads.m !== 0;
      ends.forEach(([mid, e], i) => { if (all || i > 0) rel[mid][e] = true; });
    }
    return rel;
  }

  // 靜定度公式計算（依教科書）
  function classify(model) {
    const rel = effectiveReleases(model);
    const connected = new Set();
    for (const m of model.members) { connected.add(m.n1); connected.add(m.n2); }
    const nodes = model.nodes.filter(n => connected.has(n.id));
    const j = nodes.length, mCount = model.members.length;
    let r = 0;
    for (const nd of nodes) {
      const sp = nd.support;
      if (sp.type === 'spring') r += (sp.kx > 0 ? 1 : 0) + (sp.ky > 0 ? 1 : 0) + (sp.kr > 0 ? 1 : 0);
      else r += SUPPORT_INFO[sp.type].r;
    }
    const allTruss = mCount > 0 && model.members.every(m => m.truss);
    let c = 0;
    for (const m of model.members) c += (rel[m.id][0] ? 1 : 0) + (rel[m.id][1] ? 1 : 0);
    // 所有桿端皆釋放且無轉動束制的節點：其力矩平衡式為恆等式
    let trivial = 0;
    for (const nd of nodes) {
      let any = false;
      for (const m of model.members) {
        if (m.n1 === nd.id && !rel[m.id][0]) any = true;
        if (m.n2 === nd.id && !rel[m.id][1]) any = true;
      }
      if (!any && !rotRestrained(nd)) trivial++;
    }
    const lines = [];
    let n;
    if (allTruss) {
      n = mCount + r - 2 * j;
      lines.push(`桁架：n = m + r − 2j = ${mCount} + ${r} − 2×${j} = ${n}`);
    } else {
      n = 3 * mCount + r - 3 * j - c + trivial;
      lines.push(`n = 3m + r − 3j − c = 3×${mCount} + ${r} − 3×${j} − ${c}${trivial ? ` + ${trivial}` : ''} = ${n}`);
      if (trivial) lines.push(`（有 ${trivial} 個節點所有桿端皆為鉸接，其力矩平衡式不計）`);
      // 梁的簡化公式
      const beamLike = nodes.length > 0 && nodes.every(nd => Math.abs(nd.y - nodes[0].y) < 1e-9) && !model.members.some(m => m.truss);
      if (beamLike) {
        const hinges = nodes.filter(nd => nd.hinge).length;
        lines.push(`梁式：n = r − 3 − c = ${r} − 3 − ${c} = ${r - 3 - c}（內鉸 ${hinges} 個）`);
      }
    }
    let text, cls;
    if (mCount === 0) { text = '尚無桿件'; cls = 'none'; }
    else if (n < 0) { text = `不穩定（n = ${n} < 0）`; cls = 'unstable'; }
    else if (n === 0) { text = '靜定（n = 0）'; cls = 'det'; }
    else { text = `靜不定 ${n} 次`; cls = 'indet'; }
    return { m: mCount, j, r, c, trivial, n, allTruss, lines, text, cls, releases: rel };
  }

  // 幾何不穩定原因提示（僅處理常見情形：反力線平行或共點、內鉸共線）
  function instabilityHint(model) {
    const hints = [];
    const sups = model.nodes.filter(n => n.support.type !== 'none' && Model.connectedMembers(model, n.id).length);
    const lines = []; // 已知方向的反力線 {x,y,dx,dy}
    let pins = [], fixedCount = 0;
    for (const n of sups) {
      const t = n.support.type, th = n.support.angle * Math.PI / 180;
      if (t === 'roller') lines.push({ x: n.x, y: n.y, dx: -Math.sin(th), dy: Math.cos(th) });
      else if (t === 'guide') lines.push({ x: n.x, y: n.y, dx: -Math.sin(th), dy: Math.cos(th) });
      else if (t === 'pin') pins.push(n);
      else if (t === 'fixed') fixedCount++;
    }
    const hingeNodes = model.nodes.filter(n => n.hinge);
    if (!hingeNodes.length && !fixedCount) {
      if (pins.length === 0 && lines.length >= 2) {
        const par = lines.every(l => Math.abs(l.dx * lines[0].dy - l.dy * lines[0].dx) < 1e-9);
        if (par) hints.push('所有反力線互相平行（例如全部為水平面上的滾支承）→ 無法抵抗沿該方向的力，結構可平移');
        else if (lines.length === 3) {
          // 三線共點
          const a = lines[0], b = lines[1], c = lines[2];
          const den = a.dx * b.dy - a.dy * b.dx;
          if (Math.abs(den) > 1e-12) {
            const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / den;
            const px = a.x + a.dx * t, py = a.y + a.dy * t;
            const d = Math.abs((px - c.x) * c.dy - (py - c.y) * c.dx);
            if (d < 1e-6) hints.push(`三條反力線交於一點 (${Analysis.fmt(px)}, ${Analysis.fmt(py)}) → 無法抵抗對該點的力矩，結構可繞該點轉動`);
          }
        }
      } else if (pins.length === 1 && lines.length === 1) {
        const p = pins[0], l = lines[0];
        const d = Math.abs((p.x - l.x) * l.dy - (p.y - l.y) * l.dx);
        if (d < 1e-6) hints.push(`滾支承的反力線通過鉸支承節點 ${p.id} → 三條反力線共點，結構可繞該點轉動`);
      }
    }
    if (hingeNodes.length && pins.length === 2 && !fixedCount && !lines.length) {
      for (const h of hingeNodes) {
        const [a, b] = pins;
        const d = Math.abs((h.x - a.x) * (b.y - a.y) - (h.y - a.y) * (b.x - a.x)) / Math.max(1e-9, Math.hypot(b.x - a.x, b.y - a.y));
        if (d < 1e-6) hints.push(`內鉸 ${h.id} 與兩個鉸支承 ${a.id}、${b.id} 共線（三鉸共線）→ 瞬時機構，鉸處無法抵抗垂直於連線的力`);
      }
    }
    return hints;
  }

  // 主求解
  function analyze(model) {
    const { nodes, members } = model;
    const alpha = model.settings.alpha;
    const idx = new Map();
    nodes.forEach((n, i) => idx.set(n.id, i));
    const ndof = nodes.length * 3;
    const K = LinAlg.zeros(ndof, ndof);
    const F = new Array(ndof).fill(0);
    const rel = effectiveReleases(model);
    const warnings = [];
    const mdata = [];

    for (const m of members) {
      const g = Model.memberGeom(model, m);
      if (g.L < 1e-9) { warnings.push(`桿件 ${m.id} 長度為零，已忽略`); continue; }
      const loads = localLoads(m, g);
      const E = m.E, A = m.A, I = m.truss ? m.I : m.I;
      const kl = localStiffness(E, A, I, g.L);
      const R = fixedEndForces(g.L, loads, E, A, alpha, I);
      const r = [];
      if (rel[m.id][0]) r.push(2);
      if (rel[m.id][1]) r.push(5);
      let kc = kl.map(row => row.slice()), Rc = R.slice(), krrInv = null;
      if (r.length) {
        const cIdx = [0, 1, 2, 3, 4, 5].filter(i => !r.includes(i));
        const krr = r.map(i => r.map(j => kl[i][j]));
        krrInv = LinAlg.inverse(krr);
        kc = LinAlg.zeros(6, 6); Rc = [0, 0, 0, 0, 0, 0];
        for (const i of cIdx) {
          for (const j of cIdx) {
            let v = kl[i][j];
            for (let p = 0; p < r.length; p++) for (let q = 0; q < r.length; q++) v -= kl[i][r[p]] * krrInv[p][q] * kl[r[q]][j];
            kc[i][j] = v;
          }
          let rv = R[i];
          for (let p = 0; p < r.length; p++) for (let q = 0; q < r.length; q++) rv -= kl[i][r[p]] * krrInv[p][q] * R[r[q]];
          Rc[i] = rv;
        }
        let mx = 0;
        for (const row of kl) for (const v of row) mx = Math.max(mx, Math.abs(v));
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (Math.abs(kc[i][j]) < 1e-12 * mx) kc[i][j] = 0;
      }
      const T = transform(g.c, g.s), Tt = LinAlg.transpose(T);
      const Kg = LinAlg.matMul(Tt, LinAlg.matMul(kc, T));
      const Fg = LinAlg.matVec(Tt, Rc).map(v => -v);
      const i1 = idx.get(m.n1) * 3, i2 = idx.get(m.n2) * 3;
      const dofs = [i1, i1 + 1, i1 + 2, i2, i2 + 1, i2 + 2];
      for (let i = 0; i < 6; i++) {
        F[dofs[i]] += Fg[i];
        for (let j = 0; j < 6; j++) K[dofs[i]][dofs[j]] += Kg[i][j];
      }
      mdata.push({ m, g, loads, kl, R, r, krrInv, T, dofs, E, A, I });
    }

    // 節點載重
    nodes.forEach((nd, i) => { F[3 * i] += nd.loads.fx; F[3 * i + 1] += nd.loads.fy; F[3 * i + 2] += nd.loads.m; });

    // 斜向支承：旋轉該節點自由度
    const rot = new Array(nodes.length).fill(null);
    nodes.forEach((nd, i) => {
      if (nd.support.type === 'none' || Math.abs(nd.support.angle) < 1e-12) return;
      const th = nd.support.angle * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
      rot[i] = { c, s };
      const d = [3 * i, 3 * i + 1];
      // 列：K[d] = Rᵀ K[d]
      for (let j = 0; j < ndof; j++) {
        const a = K[d[0]][j], b = K[d[1]][j];
        K[d[0]][j] = c * a + s * b; K[d[1]][j] = -s * a + c * b;
      }
      for (let j = 0; j < ndof; j++) {
        const a = K[j][d[0]], b = K[j][d[1]];
        K[j][d[0]] = c * a + s * b; K[j][d[1]] = -s * a + c * b;
      }
      const a = F[d[0]], b = F[d[1]];
      F[d[0]] = c * a + s * b; F[d[1]] = -s * a + c * b;
    });

    // 自由度狀態
    const status = new Array(ndof).fill('free');
    const prescribed = new Array(ndof).fill(0);
    const hasMember = new Array(nodes.length).fill(false);
    const hasRotStiff = new Array(nodes.length).fill(false);
    for (const md of mdata) {
      hasMember[idx.get(md.m.n1)] = true; hasMember[idx.get(md.m.n2)] = true;
      if (!rel[md.m.id][0]) hasRotStiff[idx.get(md.m.n1)] = true;
      if (!rel[md.m.id][1]) hasRotStiff[idx.get(md.m.n2)] = true;
    }
    nodes.forEach((nd, i) => {
      const sp = nd.support;
      if (!hasMember[i]) { status[3 * i] = status[3 * i + 1] = status[3 * i + 2] = 'inactive'; return; }
      if (sp.type === 'spring') {
        K[3 * i][3 * i] += sp.kx; K[3 * i + 1][3 * i + 1] += sp.ky; K[3 * i + 2][3 * i + 2] += sp.kr;
        if (sp.kr > 0) hasRotStiff[i] = true;
      } else {
        for (const d of SUPPORT_INFO[sp.type].fixed) {
          status[3 * i + d] = 'fixed';
          prescribed[3 * i + d] = d === 0 ? nd.settle.dx : d === 1 ? nd.settle.dy : nd.settle.rz;
        }
      }
      if (rotRestrained(nd)) hasRotStiff[i] = true;
      if (status[3 * i + 2] === 'free' && !hasRotStiff[i]) {
        status[3 * i + 2] = 'inactive';
        if (nd.loads.m !== 0) warnings.push(`節點 ${nd.id} 的節點彎矩作用在鉸接節點上，無法傳遞，已忽略`);
      }
    });

    const free = [], fixed = [];
    for (let i = 0; i < ndof; i++) { if (status[i] === 'free') free.push(i); else if (status[i] === 'fixed') fixed.push(i); }
    const Kff = free.map(i => free.map(j => K[i][j]));
    const rhs = free.map(i => F[i] - fixed.reduce((acc, j) => acc + K[i][j] * prescribed[j], 0));
    const sol = LinAlg.solveSym(Kff, rhs);

    const base = { warnings, classification: classify(model), releases: rel, nodeIndex: idx };
    if (mdata.length === 0) return { ...base, ok: false, unstable: false, message: '尚無桿件' };
    if (sol.singular) {
      const toNodes = nv => {
        const mech = new Array(ndof).fill(0);
        free.forEach((d, k) => { mech[d] = nv[k]; });
        return nodes.map((nd, i) => {
          let ux = mech[3 * i], uy = mech[3 * i + 1];
          if (rot[i]) { const { c, s } = rot[i]; const a = ux, b = uy; ux = c * a - s * b; uy = s * a + c * b; }
          return { ux, uy, rz: mech[3 * i + 2] };
        });
      };
      const mechanisms = sol.nullVecs.map(toNodes);
      return { ...base, ok: false, unstable: true, message: `結構不穩定（勁度矩陣奇異，機構自由度 ${mechanisms.length}）`, mechanism: mechanisms[0], mechanisms, hint: instabilityHint(model) };
    }

    const u = new Array(ndof).fill(0);
    free.forEach((d, k) => { u[d] = sol.x[k]; });
    fixed.forEach(d => { u[d] = prescribed[d]; });

    // 反力（旋轉座標）→ 整體座標
    const reactions = {};
    const disp = {};
    nodes.forEach((nd, i) => {
      const d = [3 * i, 3 * i + 1, 3 * i + 2];
      const rl = [0, 0, 0];
      let any = false;
      for (let k = 0; k < 3; k++) {
        if (status[d[k]] === 'fixed') {
          let v = -F[d[k]];
          for (let j = 0; j < ndof; j++) v += K[d[k]][j] * u[j];
          rl[k] = v; any = true;
        }
      }
      const sp = nd.support;
      if (sp.type === 'spring') {
        rl[0] = -sp.kx * u[d[0]]; rl[1] = -sp.ky * u[d[1]]; rl[2] = -sp.kr * u[d[2]]; any = true;
      }
      let ux = u[d[0]], uy = u[d[1]];
      let rx = rl[0], ry = rl[1];
      if (rot[i]) {
        const { c, s } = rot[i];
        ux = c * u[d[0]] - s * u[d[1]]; uy = s * u[d[0]] + c * u[d[1]];
        rx = c * rl[0] - s * rl[1]; ry = s * rl[0] + c * rl[1];
      }
      disp[nd.id] = { ux, uy, rz: u[d[2]] };
      if (any) reactions[nd.id] = { fx: rx, fy: ry, m: rl[2], local: rl, type: sp.type, angle: sp.angle };
    });

    // 桿端力
    const memberRes = {};
    for (const md of mdata) {
      const ug = [];
      for (const nid of [md.m.n1, md.m.n2]) { const dd = disp[nid]; ug.push(dd.ux, dd.uy, dd.rz); }
      const ul = LinAlg.matVec(md.T, ug);
      if (md.r.length) {
        const cIdx = [0, 1, 2, 3, 4, 5].filter(i => !md.r.includes(i));
        const rhsR = md.r.map(i => cIdx.reduce((acc, j) => acc + md.kl[i][j] * ul[j], 0) + md.R[i]);
        md.r.forEach((i, p) => { ul[i] = -md.r.reduce((acc, _, q) => acc + md.krrInv[p][q] * rhsR[q], 0); });
      }
      const fl = LinAlg.matVec(md.kl, ul).map((v, i) => v + md.R[i]);
      memberRes[md.m.id] = {
        member: md.m, geom: md.g, loads: md.loads, E: md.E, A: md.A, I: md.I,
        ul, f1: { fx: fl[0], fy: fl[1], m: fl[2] }, f2: { fx: fl[3], fy: fl[4], m: fl[5] },
        releases: rel[md.m.id],
      };
    }
    return { ...base, ok: true, unstable: false, disp, reactions, members: memberRes };
  }

  return { SUPPORT_INFO, analyze, classify, effectiveReleases, localStiffness, fixedEndForces, localLoads, instabilityHint };
})();
