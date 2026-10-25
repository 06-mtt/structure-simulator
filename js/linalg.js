// 線性代數工具：對稱正定（或半定）矩陣的求解與奇異性判斷
const LinAlg = (() => {
  // 解 K x = F。回傳 {x, singular, rank, nullVec}
  // 先做對角線尺度化，再用部分樞軸的 Gauss-Jordan 消去；樞軸小於 tol 視為奇異。
  function solveSym(K, F, tol = 1e-9) {
    const n = K.length;
    if (n === 0) return { x: [], singular: false, rank: 0, nullVec: null };
    const s = new Array(n);
    for (let i = 0; i < n; i++) s[i] = K[i][i] > 0 ? 1 / Math.sqrt(K[i][i]) : 1;
    const A = new Array(n);
    for (let i = 0; i < n; i++) {
      A[i] = new Float64Array(n + 1);
      for (let j = 0; j < n; j++) A[i][j] = K[i][j] * s[i] * s[j];
      A[i][n] = F[i] * s[i];
    }
    const pivotOf = new Array(n).fill(-1);
    let row = 0;
    for (let col = 0; col < n && row < n; col++) {
      let best = row, bv = Math.abs(A[row][col]);
      for (let r = row + 1; r < n; r++) {
        const v = Math.abs(A[r][col]);
        if (v > bv) { bv = v; best = r; }
      }
      if (bv < tol) continue;
      const tmp = A[row]; A[row] = A[best]; A[best] = tmp;
      const p = A[row][col];
      for (let j = col; j <= n; j++) A[row][j] /= p;
      for (let r = 0; r < n; r++) {
        if (r === row) continue;
        const f = A[r][col];
        if (f === 0) continue;
        for (let j = col; j <= n; j++) A[r][j] -= f * A[row][j];
      }
      pivotOf[col] = row;
      row++;
    }
    const rank = row;
    if (rank < n) {
      // 每個自由行對應一個零空間向量（機構模態）
      const nullVecs = [];
      for (let freeCol = 0; freeCol < n; freeCol++) {
        if (pivotOf[freeCol] >= 0) continue;
        const nv = new Array(n).fill(0);
        nv[freeCol] = 1;
        for (let c = 0; c < n; c++) if (pivotOf[c] >= 0) nv[c] = -A[pivotOf[c]][freeCol];
        for (let i = 0; i < n; i++) nv[i] *= s[i];
        nullVecs.push(nv);
      }
      return { x: null, singular: true, rank, nullVec: nullVecs[0], nullVecs };
    }
    const x = new Array(n);
    for (let c = 0; c < n; c++) x[c] = A[pivotOf[c]][n] * s[c];
    return { x, singular: false, rank, nullVec: null };
  }

  function zeros(r, c) {
    const m = new Array(r);
    for (let i = 0; i < r; i++) m[i] = new Array(c).fill(0);
    return m;
  }
  function matMul(A, B) {
    const r = A.length, k = B.length, c = B[0].length;
    const C = zeros(r, c);
    for (let i = 0; i < r; i++)
      for (let j = 0; j < c; j++) {
        let sum = 0;
        for (let t = 0; t < k; t++) sum += A[i][t] * B[t][j];
        C[i][j] = sum;
      }
    return C;
  }
  function matVec(A, v) {
    return A.map(row => row.reduce((acc, a, j) => acc + a * v[j], 0));
  }
  function transpose(A) {
    const r = A.length, c = A[0].length;
    const T = zeros(c, r);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j];
    return T;
  }
  // 小矩陣反矩陣（Gauss-Jordan）
  function inverse(A) {
    const n = A.length;
    const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let best = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[best][c])) best = r;
      if (Math.abs(M[best][c]) < 1e-300) return null;
      const tmp = M[c]; M[c] = M[best]; M[best] = tmp;
      const p = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= p;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(row => row.slice(n));
  }
  return { solveSym, zeros, matMul, matVec, transpose, inverse };
})();
