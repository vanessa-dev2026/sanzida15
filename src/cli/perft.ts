import { perft, startState } from '../core/rules.js';

const depth = Number(process.argv[2] ?? 4);
const s = startState([0, 2, 4]);
const t0 = Date.now();
for (let d = 1; d <= depth; d++) {
  const t = Date.now();
  const n = perft(s, d);
  console.log(`depth ${d}: ${n}  (${Date.now() - t}ms)`);
}
console.log(`total ${Date.now() - t0}ms`);
