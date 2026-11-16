import { bits, bit, popcount, maskOf } from './board.js';
import { applyMove, legalMoves, trappedWolves, wolfMoves, sheepMoves, WOLVES, } from './moves.js';
/** 狼胜线：场上羊 <= 3 只（4 只羊才够围住盘中央的 1 只狼） */
export const WOLF_WIN_SHEEP_LEFT = 3;
/** 起始局面：3 只狼在上层 5 点中选 3 个；15 只羊占满下三层 */
export function startState(wolfCols = [0, 2, 4]) {
    let wolves = 0;
    for (const c of wolfCols)
        wolves |= bit(c);
    let sheep = 0;
    for (let r = 2; r <= 4; r++)
        for (let c = 0; c < 5; c++)
            sheep |= bit(r * 5 + c);
    return { wolves, sheep, turn: WOLVES };
}
export function keyOf(s) {
    return `${s.wolves}|${s.sheep}|${s.turn}`;
}
export function outcomeOf(s, repetitions = 1) {
    if (popcount(s.sheep) <= WOLF_WIN_SHEEP_LEFT)
        return 'wolf';
    if (s.turn === WOLVES && trappedWolves(s.wolves, s.sheep).length === popcount(s.wolves)) {
        return 'sheep';
    }
    if (repetitions >= 3)
        return 'draw';
    return null;
}
/**
 * 一局棋：管理走子、重复局面和结果。
 * 不设回合上限；同一局面第 3 次出现判和。
 */
export class Game {
    state;
    moves = [];
    /** 走过的局面（含起始），供 AI 避免重复 */
    historyKeys = [];
    seen = new Map();
    result = null;
    constructor(start) {
        this.state = start ?? startState();
        this.bump(this.state);
        this.historyKeys.push(keyOf(this.state));
        this.result = outcomeOf(this.state, this.seen.get(keyOf(this.state)));
    }
    bump(s) {
        const k = keyOf(s);
        this.seen.set(k, (this.seen.get(k) ?? 0) + 1);
    }
    legalMoves() {
        return legalMoves(this.state);
    }
    outcome() {
        return this.result;
    }
    /** 走一步；非法走法直接抛错（调用方应先取 legalMoves） */
    play(move) {
        if (this.result)
            throw new Error('game already finished');
        const legal = this.legalMoves().some((m) => m.from === move.from && m.to === move.to && m.captured === move.captured);
        if (!legal)
            throw new Error(`illegal move ${move.from}->${move.to}`);
        this.state = applyMove(this.state, move);
        this.moves.push(move);
        this.bump(this.state);
        this.historyKeys.push(keyOf(this.state));
        this.result = outcomeOf(this.state, this.seen.get(keyOf(this.state)));
    }
    /** 已有局面出现次数（含当前） */
    repetitionOf(s = this.state) {
        return this.seen.get(keyOf(s)) ?? 0;
    }
    clone() {
        const g = new Game(this.state);
        g.moves = this.moves.slice();
        g.historyKeys = this.historyKeys.slice();
        g.seen = new Map(this.seen);
        g.result = this.result;
        return g;
    }
}
/** perft：用于规则回归，数字必须与 Python 原型一致 */
export function perft(state, depth) {
    if (depth === 0)
        return 1;
    const moves = state.turn === WOLVES
        ? wolfMoves(state.wolves, state.sheep)
        : sheepMoves(state.wolves, state.sheep);
    if (moves.length === 0)
        return 0;
    if (depth === 1)
        return moves.length;
    let total = 0;
    for (const m of moves)
        total += perft(applyMove(state, m), depth - 1);
    return total;
}
export function describe(s) {
    const rows = [];
    for (let r = 0; r < 5; r++) {
        const cells = [];
        for (let c = 0; c < 5; c++) {
            const p = r * 5 + c;
            const isW = (s.wolves & bit(p)) !== 0;
            const isS = (s.sheep & bit(p)) !== 0;
            cells.push(isW ? 'W' : isS ? 'S' : '.');
        }
        rows.push(cells.join(' '));
    }
    return rows.join('\n') + `\n(turn=${s.turn === WOLVES ? 'wolf' : 'sheep'}, ` +
        `wolves=${bits(s.wolves).join(',')}, sheep=${popcount(s.sheep)})`;
}
export { maskOf };
//# sourceMappingURL=rules.js.map