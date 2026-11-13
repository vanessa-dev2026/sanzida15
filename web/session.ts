import { Game, startState, type Outcome } from '../src/core/rules.js';
import { chooseMove, LEVELS, type LevelName } from '../src/core/ai.js';
import { WOLVES, type Move } from '../src/core/moves.js';
import { encodeCode } from './codec.js';

export type Side = 'wolf' | 'sheep';

export interface SessionOptions {
  humanSide: Side;
  level: LevelName;
  /** 双人模式：双方都由玩家操作，AI 不动 */
  manual?: boolean;
  /** 起始摆位：3 只狼所在的列 */
  wolfCols?: [number, number, number];
  /** 载入已进行到一半的棋局（邀请码） */
  game?: Game;
}

export interface MoveChoice {
  from: number;
  to: number;
  captured: number;
}

/**
 * 一局棋的状态机（不碰 DOM，可单测）。
 * UI 只负责把点击翻译成 from/to，再调用这里。
 */
export class Session {
  game: Game;
  humanSide: Side;
  level: LevelName;
  manual: boolean;
  wolfCols: [number, number, number];
  private stack: Game[] = [];

  constructor(opts: SessionOptions) {
    this.humanSide = opts.humanSide;
    this.level = opts.level;
    this.manual = opts.manual ?? false;
    this.wolfCols = opts.wolfCols ?? [0, 2, 4];
    this.game = opts.game ?? new Game(startState(this.wolfCols));
  }

  get humanTurn(): boolean {
    if (this.manual) return true;
    return (this.game.state.turn === WOLVES ? 'wolf' : 'sheep') === this.humanSide;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  get outcome(): Outcome {
    return this.game.outcome();
  }

  get sheepLeft(): number {
    let n = 0;
    let m = this.game.state.sheep;
    while (m) { m &= m - 1; n++; }
    return n;
  }

  get moveCount(): number {
    return this.game.moves.length;
  }

  /** 某个点上所有合法走法 */
  movesFrom(point: number): MoveChoice[] {
    return this.game
      .legalMoves()
      .filter((m) => m.from === point)
      .map((m) => ({ from: m.from, to: m.to, captured: m.captured }));
  }

  /** 当前所有可吃子走法 */
  captures(): MoveChoice[] {
    return this.game
      .legalMoves()
      .filter((m) => m.captured >= 0)
      .map((m) => ({ from: m.from, to: m.to, captured: m.captured }));
  }

  /** 人类走一步；非法返回 false，不改状态 */
  playHuman(from: number, to: number): boolean {
    if (this.outcome || !this.humanTurn) return false;
    const mv: Move | undefined = this.game
      .legalMoves()
      .find((m) => m.from === from && m.to === to);
    if (!mv) return false;
    this.stack.push(this.game.clone());
    this.game.play(mv);
    return true;
  }

  /** 让 AI 走一步；不是 AI 的回合就返回 null */
  playAi(): Move | null {
    if (this.manual || this.outcome || this.humanTurn) return null;
    const r = chooseMove(this.game.state, {
      ...LEVELS[this.level],
      history: this.game.historyKeys,
    });
    if (!r) return null;
    this.stack.push(this.game.clone());
    this.game.play(r.move);
    return r.move;
  }

  /** 撤销一步 */
  undo(): boolean {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.game = prev;
    return true;
  }

  /** 当前棋局的邀请码 */
  code(): string {
    return encodeCode(this.wolfCols, this.game.moves);
  }

  restart(): void {
    this.game = new Game(startState(this.wolfCols));
    this.stack = [];
  }
}
