# 三打十五 · 静态版

纯 HTML/CSS/JS，没有后端，放到任何静态托管都能跑。

## 发布（选一个）

### 1. Netlify Drop（最简单）
1. 打开 https://app.netlify.com/drop
2. 把整个 dist-public 文件夹拖进去
3. 得到 https://xxxx.netlify.app，发给朋友

### 2. Vercel
在 dist-public 目录下执行 npx vercel deploy --prod

### 3. GitHub Pages
把 dist-public 的内容推到 gh-pages 分支，仓库设置里开 Pages。

## 和朋友下

1. 你走几步 → 点“邀请朋友接着下” → 复制链接发给他
2. 他打开、走几步 → 再点一次“邀请朋友接着下” → 把新链接发回来
3. 轮流直到终局

链接里带完整棋局，不需要服务器存档，刷新也不丢。
每次发出去的是“当前局面”，收到旧链接只会回到当时那一步。
