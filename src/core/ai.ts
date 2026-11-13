import { popcount, bit } from './board.js';
import {
  applyMove,
  sheepMoves,
  wolfMoves,
  WOLVES,
  SHEEP,
  type Move,
  type State,
} from './moves.js';
import { evalForSide } from './eval.js';
import { WOLF_WIN_SHEEP_LEFT } from './rules.js';

export interface AiOptions {
  /** 思考时间上限（毫秒）；到点即返回上一层的最佳走法 */
  timeMs: number;
  /** 最大搜索深度 */
  maxDepth: number;
  /** 失误率：以该概率从"次优走法"里随机挑一个（让低难度可赢） */
  blunder?: number;
  /** 随机源，便于测试复现 */
  rng?: () => number;
  /** 和棋厌恶：>0 时 AI 宁可冒险也不接受重复和棋（单位≈1 只羊的百分之一） */
  contempt?: number;
  /** 对局历史局面；传给搜索，避免 AI 走回已经出现过的局面 */
  history?: readonly string[];
}

export interface SearchResult {
  move: Move;
  score: number;
  depth: number;
  nodes: number;
}

const INF = 1e9;
const MATE = 1e8;

/** 终局判断（不含重复和：搜索里不追踪历史） */
function terminalScore(s: State): number | null {
  if (popcount(s.sheep) <= WOLF_WIN_SHEEP_LEFT) {
    return s.turn === WOLVES ? MATE : -MATE;
  }
  if (s.turn === WOLVES && wolfMoves(s.wolves, s.sheep).length === 0) {
    return -MATE; // 羊胜
  }
  if (s.turn === SHEEP && sheepMoves(s.wolves, s.sheep).length === 0) {
    return 0; // 羊无子可动 → 和
  }
  return null;
}

class Searcher {
  nodes = 0;
  aborted = false;
  deadline = Infinity;
  path = new Set<string>();
  tt = new Map<string, { depth: number; score: number; flag: 0 | 1 | 2; move?: Move }>();

  constructor(
    private maxDepth: number,
    timeMs: number,
    private contempt: number,
  ) {
    this.deadline = Date.now() + timeMs;
  }

  private order(s: State, moves: Move[]): Move[] {
    return moves
      .map((m) => {
        let sc = 0;
        if (m.captured >= 0) sc += 1000;
        // 占中/靠近阿斗的方向略优先，减少随机性
        sc += (4 - ((m.to / 5) | 0)) * 2;
        return { m, sc };
      })
      .sort((a, b) => b.sc - a.sc)
      .map((x) => x.m);
  }

  negamax(s: State, depth: number, alpha: number, beta: number): number {
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    const term = terminalScore(s);
    if (term !== null) return term;
    if (depth <= 0) return evalForSide(s);

    const key = s.wolves + '|' + s.sheep + '|' + s.turn;
    // 走到重复局面 = 和棋；对行棋方略不利，逼 AI 求变而不是原地打转
    if (this.path.has(key)) return -this.contempt;
    const hit = this.tt.get(key);
    if (hit && hit.depth >= depth) {
      if (hit.flag === 0) return hit.score;
      if (hit.flag === 1) alpha = Math.max(alpha, hit.score);
      else beta = Math.min(beta, hit.score);
      if (alpha >= beta) return hit.score;
    }

    const moves = this.order(
      s,
      s.turn === WOLVES ? wolfMoves(s.wolves, s.sheep) : sheepMoves(s.wolves, s.sheep),
    );
    if (moves.length === 0) return 0;

    const alpha0 = alpha;
    let best = -INF;
    let bestMove: Move | undefined;
    this.path.add(key);
    for (const m of moves) {
      const sc = -this.negamax(applyMove(s, m), depth - 1, -beta, -alpha);
      if (this.aborted) break;
      if (sc > best) {
        best = sc;
        bestMove = m;
      }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }

    this.path.delete(key);
    const flag: 0 | 1 | 2 = best <= alpha0 ? 2 : best >= beta ? 1 : 0;
    if (!this.aborted) this.tt.set(key, { depth, score: best, flag, move: bestMove });
    return best;
  }
}

/**
 * 选一步棋。迭代加深 + 置换表；返回本轮完成搜索的最佳走法。
 */
export function chooseMove(state: State, opts: AiOptions): SearchResult | null {
  const rng = opts.rng ?? Math.random;
  const moves = state.turn === WOLVES
    ? wolfMoves(state.wolves, state.sheep)
    : sheepMoves(state.wolves, state.sheep);
  if (moves.length === 0) return null;

  const order = moves
    .map((m) => ({ m, sc: m.captured >= 0 ? 1000 + ((m.to / 5) | 0) : 0 }))
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.m);

  const searcher = new Searcher(opts.maxDepth, opts.timeMs, opts.contempt ?? 0);
  if (opts.history) for (const k of opts.history) searcher.path.add(k);
  let bestScore = -INF;
  let bestMove = order[0];

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    let localBest = order[0];
    let localScore = -INF;
    let alpha = -INF;
    for (const m of order) {
      const sc = -searcher.negamax(applyMove(state, m), depth - 1, -INF, -alpha);
      if (searcher.aborted) break;
      if (sc > localScore) {
        localScore = sc;
        localBest = m;
      }
      if (sc > alpha) alpha = sc;
    }
    if (searcher.aborted) break;
    bestScore = localScore;
    bestMove = localBest;
    // 把上一轮最佳放到最前，提升剪枝
    order.splice(order.indexOf(localBest), 1);
    order.unshift(localBest);
    if (bestScore >= MATE - 1000) break; // 已经找到必胜，不用再深
  }

  // 失误率：从"次优"里随机选（低难度用）
  const blunder = opts.blunder ?? 0;
  if (blunder > 0 && rng() < blunder && order.length > 1) {
    const idx = 1 + Math.floor(rng() * (order.length - 1));
    return { move: order[idx], score: bestScore, depth: opts.maxDepth, nodes: searcher.nodes };
  }

  return { move: bestMove, score: bestScore, depth: opts.maxDepth, nodes: searcher.nodes };
}

/** 三档预设 */
export const LEVELS = {
  newbie: { timeMs: 200, maxDepth: 3, blunder: 0.18, contempt: 0 },
  officer: { timeMs: 900, maxDepth: 5, blunder: 0.03, contempt: 12 },
  general: { timeMs: 2000, maxDepth: 7, blunder: 0, contempt: 20 },
} as const;

export type LevelName = keyof typeof LEVELS;
