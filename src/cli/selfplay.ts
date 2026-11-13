import { pathToFileURL } from 'node:url';
import { Game, startState } from '../core/rules.js';
import { chooseMove, LEVELS, type LevelName } from '../core/ai.js';
import { WOLVES } from '../core/moves.js';

/** 简单的确定性随机数（便于复现） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GameResult {
  result: 'wolf' | 'sheep' | 'draw';
  plies: number;
  eaten: number;
}

const SAFETY_PLIES = 2000;

export function playOne(
  wolfLevel: LevelName | 'random',
  sheepLevel: LevelName | 'random',
  seed: number,
): GameResult {
  const g = new Game(startState([0, 2, 4]));
  const rng = mulberry32(seed);
  let plies = 0;

  while (!g.outcome() && plies < SAFETY_PLIES) {
    const lvl = g.state.turn === WOLVES ? wolfLevel : sheepLevel;
    if (lvl === 'random') {
      const ms = g.legalMoves();
      g.play(ms[Math.floor(rng() * ms.length)]);
    } else {
      const opts = LEVELS[lvl];
      const r = chooseMove(g.state, { ...opts, rng, history: g.historyKeys });
      if (!r) break;
      g.play(r.move);
    }
    plies++;
  }

  const eaten = 15 - countSheep(g.state.sheep);
  return {
    result: (g.outcome() ?? 'draw') as 'wolf' | 'sheep' | 'draw',
    plies,
    eaten,
  };
}

function countSheep(m: number): number {
  let n = 0;
  let x = m;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

function main(): void {
  const args = process.argv.slice(2);
  const get = (k: string, d: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
  };
  const games = Number(get('games', '50'));
  const wolfLevel = get('wolf', 'officer') as LevelName | 'random';
  const sheepLevel = get('sheep', 'officer') as LevelName | 'random';

  const tally = { wolf: 0, sheep: 0, draw: 0 };
  let sumPlies = 0;
  let sumEaten = 0;

  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const r = playOne(wolfLevel, sheepLevel, i * 7919 + 13);
    tally[r.result]++;
    sumPlies += r.plies;
    sumEaten += r.eaten;
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r  ${i + 1}/${games}  ...`);
    }
  }
  const dt = Date.now() - t0;

  console.log(`\n\n狼=${wolfLevel}  羊=${sheepLevel}  局数=${games}`);
  console.log(`  狼胜 ${((tally.wolf / games) * 100).toFixed(1)}%  ` +
    `羊胜 ${((tally.sheep / games) * 100).toFixed(1)}%  ` +
    `和棋 ${((tally.draw / games) * 100).toFixed(1)}%`);
  console.log(`  平均 ${(sumPlies / games).toFixed(1)} 步，平均吃掉 ${(sumEaten / games).toFixed(2)} 只羊`);
  console.log(`  用时 ${(dt / 1000).toFixed(1)}s（${(dt / games).toFixed(0)}ms/局）`);
}

// 只有直接运行这个文件时才跑 CLI；被测试 import 时不执行
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
