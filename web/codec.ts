import { Game, startState } from '../src/core/rules.js';
import type { Move } from '../src/core/moves.js';

/** 去掉容易混淆的 i l o u */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

const LAYOUTS: Array<[number, number, number]> = [
  [0, 1, 2], [0, 1, 3], [0, 1, 4], [0, 2, 3], [0, 2, 4],
  [0, 3, 4], [1, 2, 3], [1, 2, 4], [1, 3, 4], [2, 3, 4],
];

export const VERSION = 'SD1';

export function layoutIndex(layout: readonly number[]): number {
  const i = LAYOUTS.findIndex(
    (l) => l[0] === layout[0] && l[1] === layout[1] && l[2] === layout[2],
  );
  return i < 0 ? 4 : i; // 默认 0,2,4
}

/**
 * 把一局棋编码成短码：SD1 + 布局 + 每步两字符（起点、终点）。
 * 被吃子不需要单独存：轮到狼且落点原本有羊，就是吃子。
 */
export function encodeCode(layout: readonly number[], moves: readonly Move[]): string {
  let s = VERSION + ALPHABET[layoutIndex(layout)];
  for (const m of moves) s += ALPHABET[m.from] + ALPHABET[m.to];
  return s;
}

export type Decoded =
  | { ok: true; layout: [number, number, number]; moves: Array<{ from: number; to: number }> }
  | { ok: false; error: string };

export function decodeCode(code: string): Decoded {
  if (!code.startsWith(VERSION)) return { ok: false, error: `版本不对（应以 ${VERSION} 开头）` };
  if (code.length < 4) return { ok: false, error: '码太短' };
  const li = ALPHABET.indexOf(code[3]);
  if (li < 0 || li >= LAYOUTS.length) return { ok: false, error: '布局无效' };
  const body = code.slice(4);
  if (body.length % 2 !== 0) return { ok: false, error: '步数不成对，可能少复制了字符' };
  const moves: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < body.length; i += 2) {
    const from = ALPHABET.indexOf(body[i]);
    const to = ALPHABET.indexOf(body[i + 1]);
    if (from < 0 || to < 0) return { ok: false, error: `第 ${i / 2 + 1} 步含无效字符` };
    if (from === to) return { ok: false, error: `第 ${i / 2 + 1} 步起点终点相同` };
    moves.push({ from, to });
  }
  return { ok: true, layout: LAYOUTS[li], moves };
}

/** 按码重放，返回一个可直接接着下的 Game */
export function replayCode(
  code: string,
): { ok: true; game: Game; layout: [number, number, number] } | { ok: false; error: string } {
  const dec = decodeCode(code);
  if (!dec.ok) return dec;
  const game = new Game(startState(dec.layout));
  for (let i = 0; i < dec.moves.length; i++) {
    const { from, to } = dec.moves[i];
    const legal = game.legalMoves().find((m) => m.from === from && m.to === to);
    if (!legal) return { ok: false, error: `第 ${i + 1} 步不合法（可能不是按顺序下的）` };
    game.play(legal);
  }
  return { ok: true, game, layout: dec.layout };
}

export function shareUrl(code: string): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#g=${code}`;
}
