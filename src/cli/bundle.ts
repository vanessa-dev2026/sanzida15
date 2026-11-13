import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

/**
 * 打一个纯静态包：index.html + web/style.css + 运行需要的 js。
 * 产物在 dist-public/，整个文件夹拖到任何静态托管即可。
 */
const root = resolve(process.cwd());
const out = join(root, 'dist-public');

async function copyJs(fromDir: string, toDir: string): Promise<number> {
  await mkdir(toDir, { recursive: true });
  let n = 0;
  for (const entry of await readdir(fromDir, { withFileTypes: true })) {
    const src = join(fromDir, entry.name);
    if (entry.isDirectory()) {
      n += await copyJs(src, join(toDir, entry.name));
    } else if (extname(entry.name) === '.js') {
      await cp(src, join(toDir, entry.name));
      n++;
    }
  }
  return n;
}

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'web'), { recursive: true });

await cp(join(root, 'index.html'), join(out, 'index.html'));
await cp(join(root, 'web', 'style.css'), join(out, 'web', 'style.css'));
const nCore = await copyJs(join(root, 'dist', 'src', 'core'), join(out, 'dist', 'src', 'core'));
const nWeb = await copyJs(join(root, 'dist', 'web'), join(out, 'dist', 'web'));

const readme = `# 三打十五 · 静态版

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
`;

await writeFile(join(out, 'README.md'), readme, 'utf8');
console.log(`静态包已生成：${out}`);
console.log(`  core js ${nCore} 个，web js ${nWeb} 个`);
console.log('  部署后打开根路径即可，不需要任何后端。');
