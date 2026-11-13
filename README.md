# 三打十五 · 规则内核与 AI

纯 TypeScript，**零运行时依赖**。UI 与 TapTap 构建不在本仓库范围内。

## 环境

本机只有 `node.exe`（Node 24），没有 npm/npx。用 pnpm 或直接调用 `node_modules/typescript/bin/tsc`：

```powershell
# 构建
node node_modules/typescript/bin/tsc -p tsconfig.json

# 跑测试（27 项）
node dist/tests/core/perft.test.js
node dist/tests/core/rules.test.js
node dist/tests/core/ai.test.js
node dist/tests/web/session.test.js

# 网页版（浏览器/手机）
node dist/src/cli/serve.js --port 8787 --host 0.0.0.0
# 然后打开 http://127.0.0.1:8787/ （手机用电脑的局域网 IP）

# 自己下一盘（终端）
node dist/src/cli/play.js --side wolf --level officer

# 自对弈
node dist/src/cli/selfplay.js --games 20 --wolf officer --sheep officer

# perft
node dist/src/cli/perft.js 5
```

> 为什么不用 vitest：pnpm 的构建脚本白名单策略导致 esbuild 装不全，改用 Node 自带 `node:test`，零额外依赖更稳。

## 目录

```
src/core/
  board.ts    棋盘常量、四向邻接、跳吃落点、TRAP_POINTS（围死一只狼必须占的点）
  moves.ts    走法生成、吃子、applyMove、围死判定
  rules.ts    胜负、三次重复判和、Game 类、perft
  eval.ts     评估函数（狼视角 + negamax 翻转）
  ai.ts       Alpha-Beta + 迭代加深 + 置换表 + 三档难度
src/cli/
  play.ts     终端人对战
  selfplay.ts 自对弈跑批
  perft.ts    走法回归
  serve.ts    网页版静态服务器
web/
  index.html  页面骨架
  style.css   宣纸/墨/朱砂配色
  main.ts     DOM 绑定（选中、落点、AI 回合）
  session.ts  对局状态机（不碰 DOM，可单测）
tests/core/
  perft.test.ts  与 Python 原型逐层对齐（7/32/194/1592/9938）
  rules.test.ts  吃子、围死、胜负、重复判和、非法走法
  ai.test.ts     合法性、优先吃子、可复现、自对弈收尾
tests/web/
  session.test.ts 选边、走子、AI 回合、重开、吃子提示
```

## 关键设计

1. **位掩码**：25 个点用 25 位整数表示狼/羊，走法生成用位运算。
2. **围死 = 邻点 + 落点**：只堵邻点不够，狼还能跳过相邻的羊——所以 `TRAP_POINTS` 包含邻点和所有可跳落点。围死角上一只狼需要 4 只羊，这是“羊 ≤ 3 判狼胜”的依据。
3. **AI 必须吃对局历史**：`chooseMove(state, { history })`。不传历史时，同档 AI 100% 和棋（46 步打转）；传了才变成 75/12.5/12.5。
4. **negamax + 置换表**：字符串键，够用；时间上限到点即返回上一层结果。
