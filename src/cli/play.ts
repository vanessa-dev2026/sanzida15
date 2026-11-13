import readline from 'node:readline';
import { bits, coord } from '../core/board.js';
import { Game, startState } from '../core/rules.js';
import { chooseMove, LEVELS, type LevelName } from '../core/ai.js';
import { WOLVES, type Move } from '../core/moves.js';

const args = process.argv.slice(2);
const get = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const humanSide = get('side', 'wolf') === 'sheep' ? 1 : 0;
const level = get('level', 'officer') as LevelName;

function render(g: Game): string {
  const s = g.state;
  const lines: string[] = ['    A B C D E'];
  for (let r = 0; r < 5; r++) {
    const cells: string[] = [];
    for (let c = 0; c < 5; c++) {
      const p = r * 5 + c;
      cells.push((s.wolves & (1 << p)) ? 'W' : (s.sheep & (1 << p)) ? 'S' : '.');
    }
    lines.push(`${r + 1}   ${cells.join(' ')}`);
  }
  lines.push(`羊 ${15 - countBits(s.sheep)}/${15} 被吃 · 步 ${g.moves.length} · ` +
    `${s.turn === WOLVES ? '狼' : '羊'}走`);
  return lines.join('\n');
}

function countBits(m: number): number {
  let n = 0;
  let x = m;
  while (x) { x &= x - 1; n++; }
  return n;
}

function parsePoint(tok: string): number | null {
  const m = /^([A-Ea-e])([1-5])$/.exec(tok.trim());
  if (!m) return null;
  return (Number(m[2]) - 1) * 5 + (m[1].toUpperCase().charCodeAt(0) - 65);
}

const g = new Game(startState([0, 2, 4]));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('三打十五 —— 你执' + (humanSide === 0 ? '狼' : '羊') + `，AI=${level}`);
console.log('输入 "A1 B1" 表示从 A1 走到 B1；输入 help 看坐标；输入 quit 退出\n');

function loop(): void {
  console.log(render(g));
  if (g.outcome()) {
    console.log(`\n结果：${g.outcome() === 'wolf' ? '狼胜' : g.outcome() === 'sheep' ? '羊胜' : '和棋'}`);
    rl.close();
    return;
  }

  if (g.state.turn !== humanSide) {
    const r = chooseMove(g.state, { ...LEVELS[level], history: g.historyKeys });
    if (!r) { console.log('无子可动'); rl.close(); return; }
    g.play(r.move);
    return loop();
  }

  const caps = g.legalMoves().filter((m) => m.captured >= 0);
  if (caps.length) console.log(`（可吃：${caps.map((m) => `${coord(m.from)}->${coord(m.to)}`).join(' ')}）`);

  rl.question('> ', (ans) => {
    const t = ans.trim().toLowerCase();
    if (t === 'quit' || t === 'q') { rl.close(); return; }
    if (t === 'help') {
      console.log('坐标：A1..E5，A 是最左列，1 是最上行');
      return loop();
    }
    const parts = t.split(/\s+/);
    if (parts.length !== 2) { console.log('格式：A1 B1'); return loop(); }
    const from = parsePoint(parts[0]);
    const to = parsePoint(parts[1]);
    if (from === null || to === null) { console.log('坐标无效'); return loop(); }
    const mv: Move | undefined = g
      .legalMoves()
      .find((m) => m.from === from && m.to === to);
    if (!mv) { console.log('这步不合法'); return loop(); }
    g.play(mv);
    return loop();
  });
}

loop();
void bits;
