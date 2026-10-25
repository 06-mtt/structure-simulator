// 標準案例驗證：比較求解器結果與閉合解
(() => {
  const rows = [];
  let pass = 0, fail = 0;
  function check(name, item, got, exp, tol = 1e-6) {
    const rel = Math.abs(got - exp) / Math.max(Math.abs(exp), 1e-9);
    const ok = (Math.abs(exp) < 1e-9 ? Math.abs(got) < 1e-6 : rel < tol);
    if (ok) pass++; else fail++;
    rows.push([name, item, got, exp, ok]);
  }
  function build(fn) {
    const model = Model.createEmpty();
    const N = (x, y, sup) => { const n = Model.addNode(model, x, y); if (sup) n.support.type = sup; return n; };
    const M = (a, b, props) => Model.addMember(model, a.id, b.id, props);
    fn({ model, N, M });
    return model;
  }
  const E = 2e8, I = 1e-4, EI = E * I;

  // 1. 簡支梁中央集中力
  {
    const L = 6, P = 10;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); M(a, b).loads.push(Model.newPointLoad(L / 2, P)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('簡支+中央P', 'Mmax', mr.maxM.M, P * L / 4);
    check('簡支+中央P', 'R左', r.reactions[1].fy, P / 2);
    check('簡支+中央P', 'δmax', Math.abs(mr.defl.maxDefl.v), P * L ** 3 / (48 * EI), 1e-3);
    check('簡支+中央P', 'V左', mr.fns.right(0).V, P / 2);
    check('簡支+中央P', '靜定度', r.classification.n, 0);
  }
  // 2. 簡支梁均布
  {
    const L = 6, w = 5;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); M(a, b).loads.push(Model.newUDL(0, L, w)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('簡支+均布', 'Mmax', mr.maxM.M, w * L * L / 8);
    check('簡支+均布', 'Mmax位置', mr.maxM.x, L / 2);
    check('簡支+均布', 'R', r.reactions[2].fy, w * L / 2);
    check('簡支+均布', 'δmax', Math.abs(mr.defl.maxDefl.v), 5 * w * L ** 4 / (384 * EI), 1e-3);
  }
  // 3. 懸臂梁端點集中力
  {
    const L = 4, P = 10;
    const m = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(L, 0); M(a, b); b.loads.fy = -P; });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('懸臂+端點P', 'M固定端', mr.minM.M, -P * L);
    check('懸臂+端點P', '反力矩', r.reactions[1].m, P * L);
    check('懸臂+端點P', 'δ端', Math.abs(r.disp[2].uy), P * L ** 3 / (3 * EI));
    check('懸臂+端點P', 'θ端', Math.abs(r.disp[2].rz), P * L * L / (2 * EI));
  }
  // 4. 懸臂梁均布
  {
    const L = 4, w = 5;
    const m = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(L, 0); M(a, b).loads.push(Model.newUDL(0, L, w)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('懸臂+均布', 'M固定端', mr.minM.M, -w * L * L / 2);
    check('懸臂+均布', 'δ端', Math.abs(r.disp[2].uy), w * L ** 4 / (8 * EI));
  }
  // 5. 固定梁均布
  {
    const L = 6, w = 5;
    const m = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(L, 0, 'fixed'); M(a, b).loads.push(Model.newUDL(0, L, w)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('固定梁+均布', 'M端', mr.minM.M, -w * L * L / 12);
    check('固定梁+均布', 'M中', mr.maxM.M, w * L * L / 24);
    check('固定梁+均布', 'δmax', Math.abs(mr.defl.maxDefl.v), w * L ** 4 / (384 * EI), 1e-3);
    check('固定梁+均布', '靜不定度', r.classification.n, 3);
  }
  // 6. 一端固定一端滾支 均布
  {
    const L = 6, w = 5;
    const m = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(L, 0, 'roller'); M(a, b).loads.push(Model.newUDL(0, L, w)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('固定-滾支+均布', 'M固定端', mr.minM.M, -w * L * L / 8);
    check('固定-滾支+均布', 'R滾', r.reactions[2].fy, 3 * w * L / 8);
    check('固定-滾支+均布', 'M正最大', mr.maxM.M, 9 * w * L * L / 128);
    check('固定-滾支+均布', 'M正最大位置', mr.maxM.x, 5 * L / 8);
  }
  // 7. 集中彎矩（簡支中央）
  {
    const L = 6, C = 12;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); M(a, b).loads.push(Model.newMoment(L / 2, C)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    // 逆時針 C：對左支承取矩 R右·L + C = 0 → R右 = −C/L（向下），R左 = +C/L
    check('簡支+中央彎矩', 'R左', r.reactions[1].fy, C / L);
    check('簡支+中央彎矩', 'M左側', mr.fns.left(L / 2).M, C / 2);
    check('簡支+中央彎矩', 'M右側', mr.fns.right(L / 2).M, -C / 2);
  }
  // 8. Gerber 梁（內鉸）：鉸處 M = 0
  {
    const m = build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0, 'roller'), h = N(6, 0), c = N(10, 0, 'roller');
      h.hinge = true;
      M(a, b).loads.push(Model.newUDL(0, 4, 5)); M(b, h).loads.push(Model.newUDL(0, 2, 5)); M(h, c).loads.push(Model.newPointLoad(2, 10));
    });
    const r = Analysis.run(m);
    const m3 = r.members[Object.keys(r.members)[2]];
    check('Gerber梁', '鉸處M=0', m3.fns.right(0).M, 0);
    check('Gerber梁', '靜定度', r.classification.n, 0);
    // 右段簡支 4m 中央 10 → 右支承反力 5
    check('Gerber梁', 'R右', r.reactions[4].fy, 5);
    // 鉸傳遞剪力 5 到左段；左段：均布 5×6 + 端點 5，對 a 取矩：Rb×4 = 30×3 + 5×6 = 120 → Rb = 30
    check('Gerber梁', 'Rb', r.reactions[2].fy, 30);
    check('Gerber梁', 'Ra', r.reactions[1].fy, 5);
  }
  // 9. 三鉸剛架：水平推力
  {
    const m = build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(0, 4), c = N(4, 4), d = N(8, 4), e = N(8, 0, 'pin');
      c.hinge = true;
      M(a, b); M(b, c).loads.push(Model.newUDL(0, 4, 5)); M(c, d).loads.push(Model.newUDL(0, 4, 5)); M(d, e);
    });
    const r = Analysis.run(m);
    // 對稱：Ry = 20 each；對 c 取左半：H×4 = 20×4 − 20×2 → H = 10
    check('三鉸剛架', 'Ry', r.reactions[1].fy, 20);
    check('三鉸剛架', 'H', Math.abs(r.reactions[1].fx), 10);
    check('三鉸剛架', '靜定度', r.classification.n, 0);
    const bc = r.members[Object.keys(r.members)[1]];
    check('三鉸剛架', '鉸處M=0', bc.fns.left(4).M, 0);
    check('三鉸剛架', '柱頂M', bc.fns.right(0).M, -40);
  }
  // 10. 桁架：零桿與拉壓
  {
    const m = build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0), c = N(8, 0, 'roller'), e = N(4, 3);
      const T = { truss: true };
      M(a, b, T); M(b, c, T); M(a, e, T); M(e, c, T); M(b, e, T);
      e.loads.fy = -10;
    });
    const r = Analysis.run(m);
    check('桁架', '靜定度', r.classification.n, 0);
    const ids = Object.keys(r.members);
    check('桁架', '垂直桿零桿', r.members[ids[4]].maxN.N, 0);
    check('桁架', '斜桿壓力', r.members[ids[2]].maxN.N, -5 * 5 / 3);
    check('桁架', '下弦拉力', r.members[ids[0]].maxN.N, 5 * 4 / 3);
  }
  // 11. 不穩定：三個滾支承
  {
    const m = build(({ N, M }) => { const a = N(0, 0, 'roller'), b = N(4, 0, 'roller'); M(a, b); b.loads.fy = -10; });
    const r = Analysis.run(m);
    check('不穩定', 'unstable', r.unstable ? 1 : 0, 1);
    check('不穩定', 'n', r.classification.n, -1);
  }
  // 12. 幾何不穩定：n=0 但反力共點（三鉸共線）
  {
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), h = N(3, 0), b = N(6, 0, 'pin'); h.hinge = true; M(a, h); M(h, b); h.loads.fy = -10; });
    const r = Analysis.run(m);
    check('三鉸共線', 'n', r.classification.n, 0);
    check('三鉸共線', 'unstable', r.unstable ? 1 : 0, 1);
  }
  // 13. 斜向滾支承：簡支梁右端滾支承面傾 30°
  {
    const L = 6, P = 10;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); b.support.angle = 30; M(a, b).loads.push(Model.newPointLoad(L / 2, P)); });
    const r = Analysis.run(m);
    const Rb = r.reactions[2];
    // 反力垂直於支承面：方向 (−sin30, cos30)；Ry = 5 → R = 5/cos30，Rx = −R sin30
    check('斜滾支承', 'Rb_y', Rb.fy, 5);
    check('斜滾支承', 'Rb_x', Rb.fx, -5 * Math.tan(30 * Math.PI / 180));
    check('斜滾支承', 'Ra_x', r.reactions[1].fx, 5 * Math.tan(30 * Math.PI / 180));
  }
  // 14. 支承沉陷：兩跨連續梁中央支承沉陷
  {
    const L = 5, d = 0.01;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'), c = N(2 * L, 0, 'roller'); b.settle.dy = -d; M(a, b); M(b, c); });
    const r = Analysis.run(m);
    // 兩跨等跨連續梁中央沉陷 δ：中央支承反力 = 6EIδ/L³（向下），中央彎矩 = 3EIδ/L²（正）
    check('支承沉陷', 'Rb', r.reactions[2].fy, -6 * EI * d / L ** 3);
    check('支承沉陷', 'M中', r.members[Object.keys(r.members)[0]].fns.left(L).M, 3 * EI * d / L ** 2);
  }
  // 15. 溫度：兩端固定桿升溫
  {
    const L = 4, dT = 20, A = 0.01, alpha = 1.2e-5;
    const m = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(L, 0, 'fixed'); M(a, b).loads.push(Model.newTemp(dT)); });
    const r = Analysis.run(m);
    check('溫度', 'N', r.members[Object.keys(r.members)[0]].maxN.N, -E * A * alpha * dT);
  }
  // 16. 三角形載重 簡支
  {
    const L = 6, w = 6;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); const l = Model.newUDL(0, L, w); l.w1 = 0; M(a, b).loads.push(l); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    check('三角形載重', 'R零端', r.reactions[1].fy, w * L / 6);
    check('三角形載重', 'R滿端', r.reactions[2].fy, w * L / 3);
    check('三角形載重', 'Mmax', mr.maxM.M, w * L * L / (9 * Math.sqrt(3)));
    check('三角形載重', 'Mmax位置', mr.maxM.x, L / Math.sqrt(3));
  }
  // 17. 部分均布（簡支左半）
  {
    const L = 8, w = 4;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); M(a, b).loads.push(Model.newUDL(0, L / 2, w)); });
    const r = Analysis.run(m);
    const mr = Object.values(r.members)[0];
    // W = 16 at x = 2 → Rb = 16×2/8 = 4, Ra = 12；V=0 at x = 12/4 = 3；Mmax = 12×3 − 4×3²/2 = 18
    check('部分均布', 'Ra', r.reactions[1].fy, 12);
    check('部分均布', 'Mmax', mr.maxM.M, 18);
    check('部分均布', 'Mmax位置', mr.maxM.x, 3);
  }
  // 18. 門型剛架側向力（固定端，對稱）: 柱底水平反力各半
  {
    const m = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(0, 4), c = N(6, 4), d = N(6, 0, 'fixed'); M(a, b); M(b, c); M(c, d); b.loads.fx = 10; });
    const r = Analysis.run(m);
    check('門型剛架', 'Hx總和', r.reactions[1].fx + r.reactions[4].fx, -10);
    check('門型剛架', '靜不定度', r.classification.n, 3);
  }

  // 19. 三鉸拋物線拱＋節點均布：H = wL²/8f，節點 M = 0
  {
    const L = 12, f = 3, w = 5;
    const m = Model.generate({ kind: 'arch3', shape: 'parabola', span: L, rise: f, n: 12, w, loadMode: 'nodal' });
    const r = Analysis.run(m);
    check('三鉸拱(節點力)', 'H', Math.abs(r.reactions[1].fx), w * L * L / (8 * f));
    check('三鉸拱(節點力)', '靜定度', r.classification.n, 0);
    check('三鉸拱(節點力)', 'Mmax', r.maxAbsM, 0);
    check('三鉸拱(節點力)', '對照表 H', r.funicular.H, w * L * L / (8 * f));
    check('三鉸拱(節點力)', '對照表 M0−Hy', Math.max(...r.funicular.rows.map(q => Math.abs(q.Mpred))), 0);
  }
  // 20. 三鉸拋物線拱＋分布載重（投影）：H = wL²/8f，節點 M = 0
  {
    const L = 12, f = 3, w = 5;
    const m = Model.generate({ kind: 'arch3', shape: 'parabola', span: L, rise: f, n: 12, w, loadMode: 'projected' });
    const r = Analysis.run(m);
    check('三鉸拱(分布)', 'H', Math.abs(r.reactions[1].fx), w * L * L / (8 * f));
    check('三鉸拱(分布)', '節點M', Math.max(...r.funicular.rows.map(q => Math.abs(q.M))), 0);
    check('三鉸拱(分布)', 'Ry', r.reactions[1].fy, w * L / 2);
  }
  // 21. 三鉸拱＋頂點集中力：H = PL/(4f)
  {
    const L = 12, f = 3, P = 20;
    const m = Model.generate({ kind: 'arch3', shape: 'parabola', span: L, rise: f, n: 12, P });
    const r = Analysis.run(m);
    check('三鉸拱(頂點P)', 'H', Math.abs(r.reactions[1].fx), P * L / (4 * f));
    check('三鉸拱(頂點P)', 'Ry', r.reactions[1].fy, P / 2);
  }
  // 22. 纜索＋均布：H = wL²/8f，T_max = √(H² + R²)
  {
    const L = 12, f = 3, w = 5, n = 12;
    const m = Model.generate({ kind: 'cable', shape: 'parabola', span: L, rise: f, n, w });
    const r = Analysis.run(m);
    const H = w * L * L / (8 * f), RA = w * L * (n - 1) / n / 2;
    check('纜索', 'H', Math.abs(r.reactions[1].fx), H, 1e-3);
    const first = r.members[Object.keys(r.members)[0]];
    check('纜索', 'T端', first.maxN.N, Math.hypot(H, RA), 1e-3);
    // 最低點兩側段的斜率 = 4f·dx/L²，T = H/cosθ
    const slope = 4 * f * (L / n) / (L * L);
    check('纜索', '最低點附近T', r.members[Object.keys(r.members)[n / 2]].maxN.N, H * Math.sqrt(1 + slope * slope), 1e-3);
  }
  // 23. 山形三鉸剛架＋均布：H = M0(L/2)/(h+f)
  {
    const L = 12, f = 2, h = 4, w = 5;
    const m = Model.generate({ kind: 'gable3', span: L, rise: f, height: h, w });
    const r = Analysis.run(m);
    const H = (w * L * L / 8) / (h + f);
    check('山形三鉸剛架', 'H', Math.abs(r.reactions[1].fx), H);
    check('山形三鉸剛架', '柱頂M', Math.abs(Analysis.nodeMoment(m, r, 2)), H * h);
    check('山形三鉸剛架', '靜定度', r.classification.n, 0);
  }

  // 24. 零桿法則：Pratt 桁架中央豎桿（法則 2）
  {
    const m = Model.presets.find(p => p.name.startsWith('Pratt')).build();
    const r = Analysis.run(m);
    const mid = m.members.find(mm => { const a = Model.node(m, mm.n1), b = Model.node(m, mm.n2); return Math.abs(a.x - 8) < 1e-9 && Math.abs(b.x - 8) < 1e-9; });
    check('零桿(Pratt)', '中央豎桿為零', r.zero.found[mid.id] ? r.zero.found[mid.id].rule : -1, 2);
    // 另一根：滾支承節點的反力鉛直，沿端豎桿方向 → 端部下弦桿為零（法則 3）
    check('零桿(Pratt)', '零桿數', Object.keys(r.zero.found).length, 2);
    const endBottom = m.members.find(mm => { const a = Model.node(m, mm.n1), b = Model.node(m, mm.n2); return a.y === 0 && b.y === 0 && Math.max(a.x, b.x) === 16; });
    check('零桿(Pratt)', '端下弦為零(法則3)', r.zero.found[endBottom.id] ? r.zero.found[endBottom.id].rule : -1, 3);
    check('零桿(Pratt)', '計算N=0', Math.abs(r.members[mid.id].maxN.N), 0);
  }
  // 25. 零桿法則 1：懸臂桁架末端兩桿
  {
    const m = Model.presets.find(p => p.name.startsWith('懸臂桁架')).build();
    const r = Analysis.run(m);
    const rules = Object.values(r.zero.found).map(z => z.rule);
    check('零桿(懸臂)', '零桿數', rules.length, 2);
    check('零桿(懸臂)', '皆為法則1', rules.every(v => v === 1) ? 1 : 0, 1);
  }
  // 26. 零桿法則 3：載重沿桿方向
  {
    const m = build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0, 'roller'), c = N(4, 3);
      const T = { truss: true }; M(a, b, T); M(b, c, T); M(a, c, T);
      c.loads.fy = -10; // 載重沿 b–c（鉛直）
    });
    const r = Analysis.run(m);
    const ac = m.members[2], bc = m.members[1];
    check('零桿(法則3)', '桿ac零', r.zero.found[ac.id] ? r.zero.found[ac.id].rule : -1, 3);
    check('零桿(法則3)', 'bc壓力', r.members[bc.id].maxN.N, -10);
  }
  // 27. 截面法：Warren 桁架切割
  {
    const m = build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0), c = N(8, 0, 'roller'), e = N(4, 3);
      const T = { truss: true }; M(a, b, T); M(b, c, T); M(a, e, T); M(e, c, T); M(b, e, T);
      e.loads.fy = -10;
    });
    const r = Analysis.run(m);
    const sc = Analysis.sectionCut(m, r, { x1: 2, y1: -1, x2: 2, y2: 4, side: 'L' });
    check('截面法', '切到桿數', sc.cut.length, 2);
    check('截面法', 'ΣFx', sc.sums.fx, 0);
    check('截面法', 'ΣFy', sc.sums.fy, 0);
    check('截面法', '取用側節點數', sc.partNodes.size, 1);
    // 三桿切割：Pratt 桁架在 x=6 切，取左側 → 上弦、下弦、斜桿
    const pr = Model.presets.find(p => p.name.startsWith('Pratt')).build();
    const rr = Analysis.run(pr);
    const sc3 = Analysis.sectionCut(pr, rr, { x1: 6, y1: -1, x2: 6, y2: 5, side: 'L' });
    check('截面法(Pratt)', '切到桿數', sc3.cut.length, 3);
    check('截面法(Pratt)', 'ΣFy', sc3.sums.fy, 0);
    // 取矩建議的 N 值應與求解相符
    for (const sg of sc3.suggestions) {
      if (!sg.P) continue;
      const got = parseFloat(sg.text.split('= ').pop());
      const c = sc3.cut.find(q => q.id === sg.member);
      check('截面法(Pratt)', `取矩求桿${sg.member}`, got, c.N, 1e-2);
    }
  }
  // 28. 載重上限
  {
    const m = build(({ N, M }) => {
      const a = N(0, 0, 'pin'), b = N(4, 0), c = N(8, 0, 'roller'), e = N(4, 3);
      const T = { truss: true }; M(a, b, T); M(b, c, T); M(a, e, T); M(e, c, T); M(b, e, T);
      e.loads.fy = -10;
    });
    const r = Analysis.run(m);
    const lim = Analysis.loadLimit(m, r, { allowT: 100, allowC: 50, eulerK: 0 });
    check('載重上限', 'λ', lim.lambda, 50 / (25 / 3));
    check('載重上限', 'P_max', lim.lambda * lim.refP, 60);
  }

  // 29. 連續梁活載重配置：兩等跨，只載一跨 → 中央支承 M = −wL²/16；兩跨全載 → −wL²/8
  {
    const L = 6, w = 10;
    const m = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'), c = N(2 * L, 0, 'roller'); M(a, b); M(b, c); });
    const cb = Analysis.continuousBeam(m);
    check('活載重配置', '跨數', cb.spans.length, 2);
    Analysis.setLivePattern(m, cb, 0, w, [true, false]);
    let r = Analysis.run(m);
    check('活載重配置', '單跨載 M支承', Analysis.nodeMoment(m, r, 2), -w * L * L / 16);
    Analysis.setLivePattern(m, cb, 0, w, [true, true]);
    r = Analysis.run(m);
    check('活載重配置', '兩跨載 M支承', Analysis.nodeMoment(m, r, 2), -w * L * L / 8);
    const env = Analysis.envelope(m, cb, 0, w);
    check('包絡線', '配置數', env.count, 4);
    check('包絡線', '支承最小M', env.supMin[1].M, -w * L * L / 8);
    // 單跨載時該跨最大正彎矩：R_A = 7wL/16 → Mmax = (7/16)²wL²/2 = 49wL²/512
    check('包絡線', '第1跨最大正M', env.spanMax[0].M, 49 * w * L * L / 512);
    check('包絡線', '第1跨最大正M配置', env.spanMax[0].pattern[1] ? 1 : 0, 0);
  }
  // 30. 溫差梯度：固定梁 M = −EIαΔT/h；簡支梁 M = 0、δ中 = κ0L²/8（向下）
  {
    const L = 6, dTd = 20, h = 0.5, alpha = 1.2e-5, k0 = alpha * dTd / h;
    const mf = build(({ N, M }) => { const a = N(0, 0, 'fixed'), b = N(L, 0, 'fixed'); M(a, b).loads.push(Model.newTemp(0, dTd, h)); });
    const rf = Analysis.run(mf);
    check('溫差梯度', '固定梁 M', rf.members[Object.keys(rf.members)[0]].minM.M, -EI * k0);
    check('溫差梯度', '固定梁 反力', rf.reactions[1].fy, 0);
    const ms = build(({ N, M }) => { const a = N(0, 0, 'pin'), b = N(L, 0, 'roller'); M(a, b).loads.push(Model.newTemp(0, dTd, h)); });
    const rs = Analysis.run(ms);
    const mr = rs.members[Object.keys(rs.members)[0]];
    check('溫差梯度', '簡支梁 M', mr.maxAbsM, 0);
    check('溫差梯度', '簡支梁 δ中', mr.defl.v[100], -k0 * L * L / 8, 1e-3);
  }
  // 31. 非載重效應比較：簡支（靜定）無內力、連續梁（靜不定）有內力
  {
    const m = Model.presets.find(p => p.name.startsWith('沉陷比較')).build();
    const nl = Analysis.nonLoadEffects(m);
    check('非載重效應', '結構數', nl.comps.length, 2);
    const det = nl.comps.find(c => c.cls.n === 0), ind = nl.comps.find(c => c.cls.n > 0);
    check('非載重效應', '靜定 M=0', det.M, 0);
    check('非載重效應', '靜不定 M>0', ind.M > 1 ? 1 : 0, 1);
  }

  // 32. 機構模態與幾何不穩定提示
  {
    const m = Model.presets.find(p => p.name.startsWith('不穩定：三個滾支承')).build();
    const r = Analysis.run(m);
    check('機構', '平行反力線 機構數', r.mechanisms.length, 1);
    check('機構', '提示存在', r.hint.length > 0 ? 1 : 0, 1);
    // 機構為水平平移：各節點 ux 相同、uy = 0
    const ux = r.mechanisms[0].map(d => d.ux), uy = r.mechanisms[0].map(d => d.uy);
    check('機構', '水平平移', Math.max(...ux.map(v => Math.abs(v - ux[0]))) + Math.max(...uy.map(Math.abs)), 0);
    const m2 = Model.presets.find(p => p.name.startsWith('幾何不穩定：反力線共點')).build();
    const r2 = Analysis.run(m2);
    check('機構', '共點 n', r2.classification.n, 0);
    check('機構', '共點 unstable', r2.unstable ? 1 : 0, 1);
    check('機構', '共點 提示', r2.hint.length > 0 ? 1 : 0, 1);
    const m3 = Model.presets.find(p => p.name.startsWith('幾何不穩定：三鉸共線')).build();
    const r3 = Analysis.run(m3);
    check('機構', '三鉸共線 提示', r3.hint.length > 0 ? 1 : 0, 1);
  }
  // 33. A/B 比較：簡支梁加中央支承
  {
    const mA = Model.presets.find(p => p.name.startsWith('結構變更練習')).build();
    const rA = Analysis.run(mA);
    const mB = Model.clone(mA);
    Model.node(mB, 2).support.type = 'roller';
    const rB = Analysis.run(mB);
    const cmp = Analysis.compare(mA, rA, mB, rB);
    check('A/B', '差異數', cmp.diffs.length, 1);
    check('A/B', 'A n', cmp.A.n, 0);
    check('A/B', 'B n', cmp.B.n, 1);
    check('A/B', 'A Mmax', cmp.A.Mmax, 5 * 64 / 8);
    check('A/B', 'B Mmin', cmp.B.Mmin, -5 * 16 / 8);
  }

  // 34. 小計算器：斷面性質
  {
    const r = CalcCore.section('rect', { b: 30, h: 60 });
    check('斷面', '矩形 I', r.I, 30 * 60 ** 3 / 12);
    check('斷面', '矩形 S', r.Stop, 30 * 60 * 60 / 6);
    check('斷面', '矩形 r', r.r, 60 / Math.sqrt(12));
    const st = CalcCore.stresses(r, 100, 50);
    check('斷面', '矩形 τmax=1.5V/A', st.tau, 1.5 * 50 / 1800);
    check('斷面', '矩形 σ', st.sBot, 100 / 18000);
    const I = CalcCore.section('I', { bf: 20, tf: 1.5, h: 40, tw: 1 });
    check('斷面', 'I 型 I', I.I, (20 * 40 ** 3 - 19 * 37 ** 3) / 12);
    const T = CalcCore.section('T', { bf: 40, tf: 10, h: 50, tw: 15 });
    // 形心：翼板 400@45、腹板 600@20 → ȳ = (18000+12000)/1000 = 30
    check('斷面', 'T 型 ȳ', T.ybar, 30);
    check('斷面', 'T 型 I', T.I, 40 * 1000 / 12 + 400 * 225 + 15 * 64000 / 12 + 600 * 100);
    const H = CalcCore.section('hollowRect', { b: 40, h: 60, bi: 30, hi: 50 });
    check('斷面', '空心矩形 I', H.I, (40 * 60 ** 3 - 30 * 50 ** 3) / 12);
    check('斷面', '空心矩形 b_NA', H.bNA, 10);
    const C = CalcCore.section('circle', { d: 40 });
    check('斷面', '圓 I', C.I, Math.PI * 40 ** 4 / 64);
    check('斷面', '圓 τmax=4V/3A', CalcCore.stresses(C, 0, 30).tau, 4 * 30 / (3 * C.A));
  }
  // 35. 分段軸力桿
  {
    const segs = [{ L: 100, A: 10, E: 20000 }, { L: 100, A: 20, E: 20000 }];
    const r = CalcCore.axialBar(segs, [30, -50], false);
    check('軸力桿', 'N1', r.N[0], -20);
    check('軸力桿', 'N2', r.N[1], -50);
    check('軸力桿', 'δ', r.total, -20 * 100 / (20000 * 10) + -50 * 100 / (20000 * 20));
    // 兩端固定：均勻桿中點受 P → 反力各 P/2
    const r2 = CalcCore.axialBar([{ L: 100, A: 10, E: 20000 }, { L: 100, A: 10, E: 20000 }], [40, 0], true);
    check('軸力桿', '兩端固定 N1', r2.N[0], 20);
    check('軸力桿', '兩端固定 N2', r2.N[1], -20);
    check('軸力桿', '兩端固定 Σδ=0', r2.total, 0);
  }
  // 36. 柱側向勁度與週期
  {
    const r = CalcCore.storyStiffness([{ E: 1, I: 1, h: 4, fixity: 'fixed' }, { E: 1, I: 1, h: 2, fixity: 'fixed' }], 90, 0);
    check('柱勁度', '短柱 8 倍', r.items[1].k / r.items[0].k, 8);
    check('柱勁度', '短柱剪力', r.items[1].V, 80);
    const r2 = CalcCore.storyStiffness([{ E: 2e7, I: 0.002, h: 4, fixity: 'fixed' }], 0, 200);
    check('柱勁度', 'T', r2.T, 2 * Math.PI * Math.sqrt(200 / (12 * 2e7 * 0.002 / 64)));
  }
  // 37. 柱挫屈
  {
    const r = CalcCore.buckling(20000, 5000, 50, 400, 25);
    const pp = r.rows.find(x => x.key === 'pp'), ff = r.rows.find(x => x.key === 'ff'), fr = r.rows.find(x => x.key === 'ffree');
    check('挫屈', 'Pcr 兩端鉸', pp.Pcr, Math.PI ** 2 * 20000 * 5000 / 400 ** 2);
    check('挫屈', '固定/鉸 = 4', ff.Pcr / pp.Pcr, 4);
    check('挫屈', '懸臂/鉸 = 0.25', fr.Pcr / pp.Pcr, 0.25);
    check('挫屈', 'λ', pp.lambda, 400 / Math.sqrt(100));
  }

  const tbl = document.getElementById('out');
  for (const [n, item, got, exp, ok] of rows) {
    const tr = document.createElement('tr');
    tr.className = ok ? 'ok' : 'fail';
    tr.innerHTML = `<td>${n}</td><td>${item}</td><td>${Number(got).toPrecision(7)}</td><td>${Number(exp).toPrecision(7)}</td><td>${ok ? '✓' : '✗'}</td>`;
    tbl.appendChild(tr);
  }
  document.getElementById('summary').innerHTML = `<b>通過 ${pass} / ${pass + fail}</b>`;
  window.__testSummary = { pass, fail, rows };
})();
