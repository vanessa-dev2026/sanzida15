import { NEIGHBORS, bit, bits, popcount } from './board.js';
import {
  sheepMoves,
  wolfMoves,
  wolfHasMove,
  WOLVES,
  type State,
} from './moves.js';

/**
 * 从"狼"的角度评估局面（越大越对狼有利）。
 * 单位约等于 1 只羊的价值。
 */
export function evalWolf(s: State): number {
  const sheepLeft = popcount(s.sheep);
  const eaten = 15 - sheepLeft;
  let score = eaten * 100;

  const wMoves = wolfMoves(s.wolves, s.sheep);
  const sMoves = sheepMoves(s.wolves, s.sheep);
  score += (wMoves.length - sMoves.length) * 0.8;

  // 被围死的狼：最危险的信号
  // 同时看"逃生空间"——只剩 0/1 个空邻点的狼，下一步就没了
  const occ = s.wolves | s.sheep;
  let trapped = 0;
  let tight = 0;
  let minMissing = Infinity;
  for (const w of bits(s.wolves)) {
    if (!wolfHasMove(w, s.wolves, s.sheep)) {
      trapped++;
      minMissing = 0;
      continue;
    }
    let escapes = 0;
    let missing = 0;
    let lastEscape = -1;
    for (const p of NEIGHBORS[w]) {
      if (occ & bit(p)) {
        missing++;
      } else {
        escapes++;
        lastEscape = p;
      }
    }
    if (escapes <= 1) tight++;
    // 只剩一个逃生点，且那个点旁边已经有羊 → 下一步就会被堵死
    if (escapes === 1) {
      for (const q of NEIGHBORS[lastEscape]) {
        if (s.sheep & bit(q)) {
          score -= 0;
          break;
        }
      }
    }
    if (missing < minMissing) minMissing = missing;
  }
  score -= trapped * 300;
  score -= tight * 35;
  if (Number.isFinite(minMissing)) {
    score -= Math.max(0, 6 - minMissing) * 45;
  }

  // 可吃子机会
  let caps = 0;
  for (const m of wMoves) if (m.captured >= 0) caps++;
  score += caps * 12;

  // 羊的"墙"：羊与羊相邻越多，狼越难下嘴
  let contacts = 0;
  for (const p of bits(s.sheep)) {
    for (const n of NEIGHBORS[p]) {
      if (s.sheep & (1 << n)) contacts++;
    }
  }
  score -= contacts * 0.35;

  // 羊越靠上（压得越凶）越危险；狼越靠上越安全
  let sheepFront = 0;
  let wolfTop = 0;
  for (const p of bits(s.sheep)) sheepFront += 4 - ((p / 5) | 0);
  for (const p of bits(s.wolves)) wolfTop += (p / 5) | 0;
  score += wolfTop * 1.2;
  score -= sheepFront * 0.25;

  return score;
}

/** 从"当前行棋方"的角度评估（negamax 用） */
export function evalForSide(s: State): number {
  const v = evalWolf(s);
  return s.turn === WOLVES ? v : -v;
}
