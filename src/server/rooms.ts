import { randomBytes, randomInt } from 'node:crypto';
import { Game, startState, type Outcome } from '../core/rules.js';
import { WOLVES, type Move } from '../core/moves.js';

export type SideName = 'wolf' | 'sheep';

export interface Snapshot {
  id: string;
  moves: Array<{ from: number; to: number }>;
  turn: SideName;
  result: Outcome;
  sheepLeft: number;
  players: { wolf: boolean; sheep: boolean };
}

interface Room {
  id: string;
  game: Game;
  tokens: { wolf: string | null; sheep: string | null };
  listeners: Set<(s: Snapshot) => void>;
  touched: number;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function roomCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

function token(): string {
  return randomBytes(8).toString('hex');
}

export type JoinResult =
  | { ok: true; roomId: string; side: SideName; token: string }
  | { ok: false; error: string };

export class Rooms {
  private rooms = new Map<string, Room>();

  constructor(private ttlMs = 6 * 60 * 60 * 1000) {}

  create(side: SideName): { roomId: string; side: SideName; token: string } {
    let id = roomCode();
    while (this.rooms.has(id)) id = roomCode();
    const room: Room = {
      id,
      game: new Game(startState([0, 2, 4])),
      tokens: { wolf: null, sheep: null },
      listeners: new Set(),
      touched: Date.now(),
    };
    const tk = token();
    room.tokens[side] = tk;
    this.rooms.set(id, room);
    this.sweep();
    return { roomId: id, side, token: tk };
  }

  join(id: string): JoinResult {
    const room = this.rooms.get(id.toUpperCase());
    if (!room) return { ok: false, error: '房间不存在' };
    const free: SideName | null = !room.tokens.wolf ? 'wolf' : !room.tokens.sheep ? 'sheep' : null;
    if (!free) return { ok: false, error: '房间已满' };
    const tk = token();
    room.tokens[free] = tk;
    room.touched = Date.now();
    // 让已经在里面的人知道对手进来了
    this.emit(room);
    return { ok: true, roomId: room.id, side: free, token: tk };
  }

  snapshot(id: string): Snapshot | null {
    const room = this.rooms.get(id.toUpperCase());
    if (!room) return null;
    return this.snap(room);
  }

  /** 走一步；side 必须对得上回合，token 必须对得上玩家 */
  move(id: string, side: SideName, tk: string, from: number, to: number):
    { ok: true; result: Outcome } | { ok: false; error: string } {
    const room = this.rooms.get(id.toUpperCase());
    if (!room) return { ok: false, error: '房间不存在' };
    if (room.tokens[side] !== tk) return { ok: false, error: '身份不对' };
    if (room.game.outcome()) return { ok: false, error: '对局已结束' };
    if ((room.game.state.turn === WOLVES ? 'wolf' : 'sheep') !== side) {
      return { ok: false, error: '还没轮到你' };
    }
    const legal: Move | undefined = room.game
      .legalMoves()
      .find((m) => m.from === from && m.to === to);
    if (!legal) return { ok: false, error: '这步不合法' };
    room.game.play(legal);
    room.touched = Date.now();
    this.emit(room);
    return { ok: true, result: room.game.outcome() };
  }

  subscribe(id: string, cb: (s: Snapshot) => void): (() => void) | null {
    const room = this.rooms.get(id.toUpperCase());
    if (!room) return null;
    room.listeners.add(cb);
    room.touched = Date.now();
    return () => {
      room.listeners.delete(cb);
    };
  }

  private emit(room: Room): void {
    const s = this.snap(room);
    for (const cb of room.listeners) {
      try {
        cb(s);
      } catch {
        room.listeners.delete(cb);
      }
    }
  }

  private snap(room: Room): Snapshot {
    return {
      id: room.id,
      moves: room.game.moves.map((m) => ({ from: m.from, to: m.to })),
      turn: room.game.state.turn === WOLVES ? 'wolf' : 'sheep',
      result: room.game.outcome(),
      sheepLeft: countSheep(room.game.state.sheep),
      players: { wolf: !!room.tokens.wolf, sheep: !!room.tokens.sheep },
    };
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      if (now - room.touched > this.ttlMs && room.listeners.size === 0) this.rooms.delete(id);
    }
  }
}

function countSheep(m: number): number {
  let n = 0;
  let x = m;
  while (x) { x &= x - 1; n++; }
  return n;
}
