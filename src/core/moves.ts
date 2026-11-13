import {
  NEIGHBORS,
  LEAP_TO,
  JUMPS,
  bits,
  bit,
  popcount,
} from './board.js';

export type Side = 0 | 1;
/** 0 = 狼，1 = 羊 */

/**
 * 吃子规则：
 *  - leap（默认，按玩家的说法）："隔一层"= 距离两格，且中间那格必须是空的
 *    （有狼、有羊都不行）；两格外是羊时，狼落到羊的格子上把它吃掉。
 *    狼可以朝任意方向吃（包括回头吃）。
 *  - jump（备选，Fox & Geese 式）：跳过紧挨着的一只羊，落到它后面的空格。
 */
export type CaptureMode = 'leap' | 'jump';

let mode: CaptureMode = 'leap';
export function setCaptureMode(m: CaptureMode): void {
  mode = m;
}
export function getCaptureMode(): CaptureMode {
  return mode;
}

export interface State {
  wolves: number;
  sheep: number;
  turn: Side;
}

export interface Move {
  from: number;
  to: number;
  /** 被吃的羊的位置；-1 表示普通移动 */
  captured: number;
}

export const WOLVES = 0 as Side;
export const SHEEP = 1 as Side;

function leapCapture(from: number, i: number, occ: number, sheep: number): number {
  const mid = NEIGHBORS[from][i];
  const to = LEAP_TO[from][i];
  if (mid === undefined || to === undefined || to < 0) return -1;
  if (occ & bit(mid)) return -1;          // 中间必须为空：有狼或有羊都不行
  if (!(sheep & bit(to))) return -1;      // 两格外必须是一只羊
  return to;                              // 落点就是羊的位置
}

/** 某只狼能否移动/吃子 */
export function wolfHasMove(w: number, wolves: number, sheep: number): boolean {
  const occ = wolves | sheep;
  for (let i = 0; i < NEIGHBORS[w].length; i++) {
    const n = NEIGHBORS[w][i];
    if (!(occ & bit(n))) return true;
    if (mode === 'leap' && leapCapture(w, i, occ, sheep) >= 0) return true;
  }
  if (mode === 'jump') {
    for (const j of JUMPS[w]) {
      if ((sheep & bit(j.mid)) && !(occ & bit(j.to))) return true;
    }
  }
  return false;
}

export function wolfMoves(wolves: number, sheep: number): Move[] {
  const occ = wolves | sheep;
  const out: Move[] = [];
  for (const from of bits(wolves)) {
    for (let i = 0; i < NEIGHBORS[from].length; i++) {
      const n = NEIGHBORS[from][i];

      if (!(occ & bit(n))) {
        out.push({ from, to: n, captured: -1 });
      }
      if (mode === 'leap') {
        const to = leapCapture(from, i, occ, sheep);
        if (to >= 0) out.push({ from, to, captured: to });
      }
      if (mode === 'jump' && (sheep & bit(n))) {
        const j = JUMPS[from].find((x) => x.mid === n);
        if (j && !(occ & bit(j.to))) {
          out.push({ from, to: j.to, captured: n });
        }
      }
    }
  }
  return out;
}

export function sheepMoves(wolves: number, sheep: number): Move[] {
  const out: Move[] = [];
  const occ = wolves | sheep;
  for (const from of bits(sheep)) {
    for (const n of NEIGHBORS[from]) {
      if (!(occ & bit(n))) {
        out.push({ from, to: n, captured: -1 });
      }
    }
  }
  return out;
}

export function legalMoves(state: State): Move[] {
  return state.turn === WOLVES
    ? wolfMoves(state.wolves, state.sheep)
    : sheepMoves(state.wolves, state.sheep);
}

export function applyMove(state: State, move: Move): State {
  const fromBit = bit(move.from);
  const toBit = bit(move.to);
  let wolves = state.wolves;
  let sheep = state.sheep;

  if (state.turn === WOLVES) {
    // 吃子时 to 就是羊所在的格子：先把羊移除，再把狼放过去
    if (move.captured >= 0) sheep &= ~bit(move.captured);
    wolves = (wolves & ~fromBit) | toBit;
  } else {
    sheep = (sheep & ~fromBit) | toBit;
  }

  return { wolves, sheep, turn: state.turn === WOLVES ? SHEEP : WOLVES };
}

/** 被围死的狼（无任何合法走法） */
export function trappedWolves(wolves: number, sheep: number): number[] {
  return bits(wolves).filter((w) => !wolfHasMove(w, wolves, sheep));
}

export function sheepCount(state: State): number {
  return popcount(state.sheep);
}
