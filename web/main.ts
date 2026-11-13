import { Session, type Side } from './session.js';
import { chooseMove, LEVELS, type LevelName } from '../src/core/ai.js';
import { WOLVES } from '../src/core/moves.js';
import { bits } from '../src/core/board.js';
import { Game, startState } from '../src/core/rules.js';
import { replayCode, shareUrl } from './codec.js';
import { createRoom, joinRoom, sendMove, subscribe, type Snapshot, type SideName } from './net.js';

const pointsEl = document.getElementById('points') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const counterEl = document.getElementById('counter') as HTMLSpanElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;
const overlayTitle = document.getElementById('overlay-title') as HTMLDivElement;
const overlaySub = document.getElementById('overlay-sub') as HTMLDivElement;
const againBtn = document.getElementById('again') as HTMLButtonElement;
const restartBtn = document.getElementById('restart') as HTMLButtonElement;
const hintBtn = document.getElementById('hint') as HTMLButtonElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const manualBtn = document.getElementById('manual') as HTMLButtonElement;
const inviteBtn = document.getElementById('invite') as HTMLButtonElement;
const invitePanel = document.getElementById('invite-panel') as HTMLDivElement;
const inviteText = document.getElementById('invite-text') as HTMLTextAreaElement;
const inviteCopy = document.getElementById('invite-copy') as HTMLButtonElement;
const inviteClose = document.getElementById('invite-close') as HTMLButtonElement;
const netOpen = document.getElementById('net-open') as HTMLButtonElement;
const netPanel = document.getElementById('net-panel') as HTMLDivElement;
const netStatus = document.getElementById('net-status') as HTMLDivElement;
const netSide = document.getElementById('net-side') as HTMLDivElement;
const netCreate = document.getElementById('net-create') as HTMLButtonElement;
const netJoin = document.getElementById('net-join') as HTMLButtonElement;
const netCode = document.getElementById('net-code') as HTMLInputElement;
const netClose = document.getElementById('net-close') as HTMLButtonElement;
const sideSeg = document.getElementById('side-seg') as HTMLDivElement;
const levelSeg = document.getElementById('level-seg') as HTMLDivElement;

let side: Side = 'wolf';
let level: LevelName = 'officer';
let manual = false;
let session = new Session({ humanSide: side, level, manual });
let selected: number | null = null;
let targets = new Map<number, number>(); // to -> captured
let hint: { from: number; to: number } | null = null;
let busy = false;
let net: { roomId: string; side: SideName; token: string } | null = null;
let es: EventSource | null = null;
let myNetTurn = false;

const cells: HTMLButtonElement[] = [];

function buildBoard(): void {
  for (let i = 0; i < 25; i++) {
    const b = document.createElement('button');
    b.className = 'point';
    b.type = 'button';
    b.dataset.p = String(i);
    b.addEventListener('click', () => onPoint(i));
    pointsEl.appendChild(b);
    cells.push(b);
  }
}

function isWolf(p: number): boolean {
  return (session.game.state.wolves & (1 << p)) !== 0;
}
function isSheep(p: number): boolean {
  return (session.game.state.sheep & (1 << p)) !== 0;
}

function render(): void {
  const s = session.game.state;
  const wolfSet = new Set(bits(s.wolves));
  const sheepSet = new Set(bits(s.sheep));

  for (let i = 0; i < 25; i++) {
    const b = cells[i];
    b.className = 'point';
    b.textContent = '';
    if (wolfSet.has(i)) {
      b.classList.add('wolf');
      const sp = document.createElement('span');
      sp.className = 'piece';
      sp.textContent = '狼';
      b.appendChild(sp);
    } else if (sheepSet.has(i)) {
      b.classList.add('sheep');
      const sp = document.createElement('span');
      sp.className = 'piece';
      sp.textContent = '羊';
      b.appendChild(sp);
    }
    if (selected === i) b.classList.add('selected');
    if (targets.has(i)) b.classList.add(targets.get(i)! >= 0 ? 'capture-target' : 'target');
    if (hint && (hint.from === i || hint.to === i)) b.classList.add('hint');
  }

  const turn = s.turn === WOLVES ? '狼' : '羊';
  const mine = session.humanTurn;
  manualBtn.classList.toggle('on', manual);
  if (net) {
    statusEl.textContent = session.outcome
      ? '对局结束'
      : myNetTurn
        ? `联机 · 房间 ${net.roomId} · 轮到你`
        : `联机 · 房间 ${net.roomId} · 等对手`;
  } else if (session.outcome) {
    statusEl.textContent = '对局结束';
  } else if (manual) {
    statusEl.textContent = `测试模式 · ${turn}走`;
  } else if (busy) {
    statusEl.textContent = `${turn}方 AI 思考中…`;
  } else {
    statusEl.textContent = `你执${session.humanSide === 'wolf' ? '狼' : '羊'} · ${
      mine ? '轮到你' : 'AI 思考中'
    }`;
  }
  counterEl.textContent = `羊 ${session.sheepLeft}/15 · ${session.moveCount} 步`;

  const o = session.outcome;
  if (o) {
    overlay.hidden = false;
    overlayTitle.textContent = o === 'wolf' ? '狼胜' : o === 'sheep' ? '羊胜' : '和棋';
    overlaySub.textContent =
      o === 'wolf'
        ? `吃掉了 ${15 - session.sheepLeft} 只羊`
        : o === 'sheep'
          ? '三只狼全部被围死'
          : '三次重复局面';
  } else {
    overlay.hidden = true;
  }
}

function clearSelection(): void {
  selected = null;
  targets.clear();
}

function onPoint(p: number): void {
  if (busy || session.outcome) return;
  if (net) {
    if (!myNetTurn) return;
    if (selected !== null && targets.has(p)) {
      const from = selected;
      clearSelection();
      render();
      void sendMove(net.roomId, net.side, net.token, from, p).catch((e: Error) => {
        alert(e.message);
        render();
      });
      return;
    }
    const sideNow = session.game.state.turn === WOLVES ? 'wolf' : 'sheep';
    const own = sideNow === 'wolf' ? isWolf(p) : isSheep(p);
    if (own) {
      const ms = session.movesFrom(p);
      selected = ms.length ? p : null;
      targets = new Map(ms.map((m) => [m.to, m.captured]));
    } else {
      clearSelection();
    }
    render();
    return;
  }
  if (!session.humanTurn) return;

  // 点目标格：执行移动
  if (selected !== null && targets.has(p)) {
    const from = selected;
    clearSelection();
    hint = null;
    if (session.playHuman(from, p)) {
      render();
      void aiTurn();
    }
    return;
  }

  // 点自己的子：选中
  const side = session.game.state.turn === WOLVES ? 'wolf' : 'sheep';
  const own = side === 'wolf' ? isWolf(p) : isSheep(p);
  if (own) {
    const ms = session.movesFrom(p);
    if (!ms.length) {
      selected = null;
      targets.clear();
      render();
      return;
    }
    selected = p;
    targets = new Map(ms.map((m) => [m.to, m.captured]));
    render();
    return;
  }

  clearSelection();
  render();
}

async function aiTurn(): Promise<void> {
  if (net) return;
  if (session.manual) return;
  if (session.outcome) return;
  if (session.humanTurn) return;
  busy = true;
  render();
  await new Promise((r) => setTimeout(r, 180));
  session.playAi();
  busy = false;
  render();
  if (!session.humanTurn && !session.outcome) void aiTurn();
}

function newGame(): void {
  clearSelection();
  hint = null;
  busy = false;
  session = new Session({ humanSide: side, level, manual });
  render();
  if (!session.humanTurn) void aiTurn();
}

function setSide(next: Side): void {
  side = next;
  for (const b of sideSeg.querySelectorAll<HTMLButtonElement>('button')) {
    b.classList.toggle('active', b.dataset.side === next);
  }
  newGame();
}

function setLevel(next: LevelName): void {
  level = next;
  session.level = next;
  for (const b of levelSeg.querySelectorAll<HTMLButtonElement>('button')) {
    b.classList.toggle('active', b.dataset.level === next);
  }
}

sideSeg.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-side]');
  if (t?.dataset.side) setSide(t.dataset.side as Side);
});
levelSeg.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
  if (t?.dataset.level) setLevel(t.dataset.level as LevelName);
});
restartBtn.addEventListener('click', newGame);
againBtn.addEventListener('click', newGame);

undoBtn.addEventListener('click', () => {
  if (busy) return;
  if (session.undo()) {
    clearSelection();
    hint = null;
    render();
  }
});

manualBtn.addEventListener('click', () => {
  manual = !manual;
  newGame();
});

inviteBtn.addEventListener('click', () => {
  inviteText.value = shareUrl(session.code());
  inviteCopy.textContent = '复制链接';
  invitePanel.hidden = false;
  inviteText.select();
});
inviteClose.addEventListener('click', () => {
  invitePanel.hidden = true;
});
inviteCopy.addEventListener('click', async () => {
  const text = inviteText.value;
  try {
    await navigator.clipboard.writeText(text);
    inviteCopy.textContent = '已复制';
  } catch {
    inviteText.select();
    document.execCommand?.('copy');
    inviteCopy.textContent = '已复制（如未成功请手动复制）';
  }
});

hintBtn.addEventListener('click', () => {
  if (busy || session.outcome || !session.humanTurn) return;
  const r = chooseMove(session.game.state, {
    ...LEVELS.officer,
    history: session.game.historyKeys,
  });
  if (!r) return;
  hint = { from: r.move.from, to: r.move.to };
  render();
  setTimeout(() => {
    hint = null;
    render();
  }, 1600);
});

// 从邀请链接载入棋局
const hash = location.hash.match(/#g=([0-9a-z]+)/i);
if (hash) {
  const r = replayCode(hash[1]);
  if (r.ok) {
    manual = true;
    session = new Session({
      humanSide: side,
      level,
      manual: true,
      wolfCols: r.layout,
      game: r.game,
    });
    history.replaceState(null, '', location.pathname);
  } else {
    setTimeout(() => alert(`邀请码无效：${r.error}`), 50);
  }
}

function applySnapshot(snap: Snapshot): void {
  const g = new Game(startState([0, 2, 4]));
  for (const mv of snap.moves) {
    const legal = g.legalMoves().find((m) => m.from === mv.from && m.to === mv.to);
    if (legal) g.play(legal);
  }
  const side = net?.side ?? 'wolf';
  session = new Session({ humanSide: side, level, wolfCols: [0, 2, 4], game: g });
  myNetTurn = snap.turn === side;
  netStatus.textContent = snap.players.wolf && snap.players.sheep
    ? (myNetTurn ? `轮到你了（你是${side === 'wolf' ? '狼' : '羊'}）` : '等对手走…')
    : `房间 ${snap.id} · 把房号发给朋友`;
  render();
}

function connectRoom(roomId: string): void {
  es?.close();
  es = subscribe(roomId, applySnapshot, () => {
    netStatus.textContent = '连接断开，刷新页面重试';
  });
}

netOpen.addEventListener('click', () => {
  netPanel.hidden = false;
});

netSide.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-ns]');
  if (!t?.dataset.ns) return;
  for (const b of netSide.querySelectorAll<HTMLButtonElement>('button')) {
    b.classList.toggle('active', b === t);
  }
});

netCreate.addEventListener('click', async () => {
  const active = netSide.querySelector<HTMLButtonElement>('button.active');
  const side = (active?.dataset.ns ?? 'wolf') as SideName;
  try {
    const r = await createRoom(side);
    net = r;
    manual = false;
    netStatus.textContent = `房间 ${r.roomId} · 把房号发给朋友`;
    connectRoom(r.roomId);
  } catch (err) {
    netStatus.textContent = (err as Error).message;
  }
});

netJoin.addEventListener('click', async () => {
  const code = netCode.value.trim().toUpperCase();
  if (code.length < 4) {
    netStatus.textContent = '房号是 4 位';
    return;
  }
  try {
    const r = await joinRoom(code);
    net = r;
    manual = false;
    connectRoom(r.roomId);
  } catch (err) {
    netStatus.textContent = (err as Error).message;
  }
});

netClose.addEventListener('click', () => {
  netPanel.hidden = true;
});

buildBoard();
render();
if (!session.humanTurn) void aiTurn();
