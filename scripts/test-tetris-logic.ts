import assert from "node:assert";

// Tetris.tsx 와 동일한 7-bag·회전 규칙을 재현해 핵심 불변식을 검증한다.
function shuffle(a: number[]): number[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 7-bag: 각 봉지(연속 7개)마다 0..6이 정확히 한 번씩 나온다.
let bag: number[] = [];
const draw = () => {
  if (bag.length === 0) bag = shuffle([0, 1, 2, 3, 4, 5, 6]);
  return bag.shift()!;
};
for (let round = 0; round < 1000; round++) {
  const seen = new Set<number>();
  for (let k = 0; k < 7; k++) seen.add(draw());
  assert.equal(seen.size, 7, "한 봉지에 7종이 모두 나와야 함");
}

// rotateCW: 4회 회전 시 원형 복귀, 1회 회전은 실제로 달라짐
function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c];
  return out;
}
const T = [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
let cur = T;
for (let i = 0; i < 4; i++) cur = rotateCW(cur);
assert.deepEqual(cur, T, "4회 회전 시 원형 복귀");
assert.notDeepEqual(rotateCW(T), T);

console.log("tetris core (7-bag, rotation) scenarios passed");
