import { Game, startState } from '../src/core/rules.js';
import { chooseMove, LEVELS } from '../src/core/ai.js';
import { WOLVES } from '../src/core/moves.js';
import { encodeCode } from './codec.js';
/**
 * 一局棋的状态机（不碰 DOM，可单测）。
 * UI 只负责把点击翻译成 from/to，再调用这里。
 */
export class Session {
    game;
    humanSide;
    level;
    manual;
    wolfCols;
    stack = [];
    constructor(opts) {
        this.humanSide = opts.humanSide;
        this.level = opts.level;
        this.manual = opts.manual ?? false;
        this.wolfCols = opts.wolfCols ?? [0, 2, 4];
        this.game = opts.game ?? new Game(startState(this.wolfCols));
    }
    get humanTurn() {
        if (this.manual)
            return true;
        return (this.game.state.turn === WOLVES ? 'wolf' : 'sheep') === this.humanSide;
    }
    get canUndo() {
        return this.stack.length > 0;
    }
    get outcome() {
        return this.game.outcome();
    }
    get sheepLeft() {
        let n = 0;
        let m = this.game.state.sheep;
        while (m) {
            m &= m - 1;
            n++;
        }
        return n;
    }
    get moveCount() {
        return this.game.moves.length;
    }
    /** 某个点上所有合法走法 */
    movesFrom(point) {
        return this.game
            .legalMoves()
            .filter((m) => m.from === point)
            .map((m) => ({ from: m.from, to: m.to, captured: m.captured }));
    }
    /** 当前所有可吃子走法 */
    captures() {
        return this.game
            .legalMoves()
            .filter((m) => m.captured >= 0)
            .map((m) => ({ from: m.from, to: m.to, captured: m.captured }));
    }
    /** 人类走一步；非法返回 false，不改状态 */
    playHuman(from, to) {
        if (this.outcome || !this.humanTurn)
            return false;
        const mv = this.game
            .legalMoves()
            .find((m) => m.from === from && m.to === to);
        if (!mv)
            return false;
        this.stack.push(this.game.clone());
        this.game.play(mv);
        return true;
    }
    /** 让 AI 走一步；不是 AI 的回合就返回 null */
    playAi() {
        if (this.manual || this.outcome || this.humanTurn)
            return null;
        const r = chooseMove(this.game.state, {
            ...LEVELS[this.level],
            history: this.game.historyKeys,
        });
        if (!r)
            return null;
        this.stack.push(this.game.clone());
        this.game.play(r.move);
        return r.move;
    }
    /** 撤销一步 */
    undo() {
        const prev = this.stack.pop();
        if (!prev)
            return false;
        this.game = prev;
        return true;
    }
    /** 当前棋局的邀请码 */
    code() {
        return encodeCode(this.wolfCols, this.game.moves);
    }
    restart() {
        this.game = new Game(startState(this.wolfCols));
        this.stack = [];
    }
}
//# sourceMappingURL=session.js.map