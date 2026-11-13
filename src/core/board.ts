/**
 * 棋盘：5×5 = 25 个交叉点，四向连线。
 * 点用 0..24 表示，index = row * 5 + col；行 0 在最上（狼的出生区）。
 * 棋子用 25 位掩码表示（JS 位运算 32 位，25 位安全）。
 */

export const N = 5;
export const SIZE = N * N;

export const bit = (i: number): number => 1 << i;
export const rowOf = (i: number): number => (i / N) | 0;
export const colOf = (i: number): number => i % N;
export const idx = (r: number, c: number): number => r * N + c;

/** 四向：上、下、左、右 */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export interface Jump {
  /** 被跳过的点（必须有一只羊） */
  mid: number;
  /** 落点（必须为空） */
  to: number;
}

export const NEIGHBORS: number[][] = [];
/** 与 NEIGHBORS 下标一一对应的"两格远"落点；越界为 -1（不要再直接索引 JUMPS，会错位） */
export const LEAP_TO: number[][] = [];
export const JUMPS: Jump[][] = [];

for (let i = 0; i < SIZE; i++) {
  const r = rowOf(i);
  const c = colOf(i);
  const nb: number[] = [];
  const leap: number[] = [];
  const jp: Jump[] = [];
  for (const [dr, dc] of DIRS) {
    const r1 = r + dr;
    const c1 = c + dc;
    if (r1 < 0 || r1 >= N || c1 < 0 || c1 >= N) continue;
    nb.push(idx(r1, c1));
    const r2 = r + 2 * dr;
    const c2 = c + 2 * dc;
    const in2 = r2 >= 0 && r2 < N && c2 >= 0 && c2 < N;
    leap.push(in2 ? idx(r2, c2) : -1);
    if (in2) jp.push({ mid: idx(r1, c1), to: idx(r2, c2) });
  }
  NEIGHBORS.push(nb);
  LEAP_TO.push(leap);
  JUMPS.push(jp);
}

export const FULL: number = (1 << SIZE) - 1;

export function popcount(m: number): number {
  let x = m - ((m >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/** 把掩码拆成点位数组 */
export function bits(m: number): number[] {
  const out: number[] = [];
  let x = m;
  while (x) {
    const b = x & -x;
    out.push(31 - Math.clz32(b));
    x ^= b;
  }
  return out;
}

export function maskOf(points: number[]): number {
  let m = 0;
  for (const p of points) m |= bit(p);
  return m;
}

/** 围死一个点上的狼，必须被羊占住的所有点：邻点 + 各方向的落点 */
export const TRAP_POINTS: number[][] = [];
for (let i = 0; i < SIZE; i++) {
  const set = new Set<number>(NEIGHBORS[i]);
  for (const j of JUMPS[i]) set.add(j.to);
  TRAP_POINTS.push([...set]);
}

export function coord(i: number): string {
  const c = colOf(i);
  return `${'ABCDE'[c]}${rowOf(i) + 1}`;
}
