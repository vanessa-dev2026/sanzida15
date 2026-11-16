import { Session } from './session.js';
import { chooseMove, LEVELS } from '../src/core/ai.js';
import { WOLVES } from '../src/core/moves.js';
import { bits } from '../src/core/board.js';
import { Game, startState } from '../src/core/rules.js';
import { replayCode, shareUrl } from './codec.js';
import { createRoom, joinRoom, sendMove, subscribe } from './net.js';
import { P2P, peerReady } from './p2p.js';
const pointsEl = document.getElementById('points');
const statusEl = document.getElementById('status');
const counterEl = document.getElementById('counter');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const againBtn = document.getElementById('again');
const restartBtn = document.getElementById('restart');
const hintBtn = document.getElementById('hint');
const undoBtn = document.getElementById('undo');
const manualBtn = document.getElementById('manual');
const inviteBtn = document.getElementById('invite');
const invitePanel = document.getElementById('invite-panel');
const inviteText = document.getElementById('invite-text');
const inviteCopy = document.getElementById('invite-copy');
const inviteClose = document.getElementById('invite-close');
const netOpen = document.getElementById('net-open');
const netPanel = document.getElementById('net-panel');
const netStatus = document.getElementById('net-status');
const netSide = document.getElementById('net-side');
const netCreate = document.getElementById('net-create');
const netJoin = document.getElementById('net-join');
const netCode = document.getElementById('net-code');
const netClose = document.getElementById('net-close');
const netCopy = document.getElementById('net-copy');
const sideSeg = document.getElementById('side-seg');
const levelSeg = document.getElementById('level-seg');
let side = 'wolf';
let level = 'officer';
let manual = false;
let session = new Session({ humanSide: side, level, manual });
let selected = null;
let targets = new Map(); // to -> captured
let hint = null;
let busy = false;
let net = null;
/** GitHub Pages 等纯静态环境：没有后端，只能 P2P 直连 */
const P2P_MODE = location.hostname.endsWith('github.io') || location.search.includes('p2p');
let p2p = null;
let p2pSide = 'wolf';
let es = null;
let myNetTurn = false;
const cells = [];
function buildBoard() {
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
function isWolf(p) {
    return (session.game.state.wolves & (1 << p)) !== 0;
}
function isSheep(p) {
    return (session.game.state.sheep & (1 << p)) !== 0;
}
function render() {
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
        }
        else if (sheepSet.has(i)) {
            b.classList.add('sheep');
            const sp = document.createElement('span');
            sp.className = 'piece';
            sp.textContent = '羊';
            b.appendChild(sp);
        }
        if (selected === i)
            b.classList.add('selected');
        if (targets.has(i))
            b.classList.add(targets.get(i) >= 0 ? 'capture-target' : 'target');
        if (hint && (hint.from === i || hint.to === i))
            b.classList.add('hint');
    }
    const turn = s.turn === WOLVES ? '狼' : '羊';
    const mine = session.humanTurn;
    manualBtn.classList.toggle('on', manual);
    if (p2p && net) {
        statusEl.textContent = session.outcome
            ? '对局结束'
            : myNetTurn
                ? `直连 · 房间 ${net.roomId} · 轮到你`
                : `直连 · 房间 ${net.roomId} · 等对手`;
    }
    else if (net) {
        statusEl.textContent = session.outcome
            ? '对局结束'
            : myNetTurn
                ? `联机 · 房间 ${net.roomId} · 轮到你`
                : `联机 · 房间 ${net.roomId} · 等对手`;
    }
    else if (session.outcome) {
        statusEl.textContent = '对局结束';
    }
    else if (manual) {
        statusEl.textContent = `测试模式 · ${turn}走`;
    }
    else if (busy) {
        statusEl.textContent = `${turn}方 AI 思考中…`;
    }
    else {
        statusEl.textContent = `你执${session.humanSide === 'wolf' ? '狼' : '羊'} · ${mine ? '轮到你' : 'AI 思考中'}`;
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
    }
    else {
        overlay.hidden = true;
    }
}
function clearSelection() {
    selected = null;
    targets.clear();
}
function onPoint(p) {
    if (busy || session.outcome)
        return;
    if (p2p) {
        if (!myNetTurn)
            return;
        if (selected !== null && targets.has(p)) {
            const from = selected;
            clearSelection();
            if (p2p.isHost) {
                if (session.playHuman(from, p)) {
                    myNetTurn = false;
                    p2p.sendCode(session.code());
                    render();
                }
            }
            else {
                p2p.sendMove(from, p);
                render();
            }
            return;
        }
        const sideNow = session.game.state.turn === WOLVES ? 'wolf' : 'sheep';
        const own = sideNow === 'wolf' ? isWolf(p) : isSheep(p);
        if (own) {
            const ms = session.movesFrom(p);
            selected = ms.length ? p : null;
            targets = new Map(ms.map((m) => [m.to, m.captured]));
        }
        else {
            clearSelection();
        }
        render();
        return;
    }
    if (net) {
        if (!myNetTurn)
            return;
        if (selected !== null && targets.has(p)) {
            const from = selected;
            clearSelection();
            render();
            void sendMove(net.roomId, net.side, net.token, from, p).catch((e) => {
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
        }
        else {
            clearSelection();
        }
        render();
        return;
    }
    if (!session.humanTurn)
        return;
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
async function aiTurn() {
    if (net)
        return;
    if (session.manual)
        return;
    if (session.outcome)
        return;
    if (session.humanTurn)
        return;
    busy = true;
    render();
    await new Promise((r) => setTimeout(r, 180));
    session.playAi();
    busy = false;
    render();
    if (!session.humanTurn && !session.outcome)
        void aiTurn();
}
function newGame() {
    clearSelection();
    hint = null;
    busy = false;
    session = new Session({ humanSide: side, level, manual });
    render();
    if (!session.humanTurn)
        void aiTurn();
}
function setSide(next) {
    side = next;
    for (const b of sideSeg.querySelectorAll('button')) {
        b.classList.toggle('active', b.dataset.side === next);
    }
    newGame();
}
function setLevel(next) {
    level = next;
    session.level = next;
    for (const b of levelSeg.querySelectorAll('button')) {
        b.classList.toggle('active', b.dataset.level === next);
    }
}
sideSeg.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-side]');
    if (t?.dataset.side)
        setSide(t.dataset.side);
});
levelSeg.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-level]');
    if (t?.dataset.level)
        setLevel(t.dataset.level);
});
restartBtn.addEventListener('click', newGame);
againBtn.addEventListener('click', newGame);
undoBtn.addEventListener('click', () => {
    if (busy)
        return;
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
    }
    catch {
        inviteText.select();
        document.execCommand?.('copy');
        inviteCopy.textContent = '已复制（如未成功请手动复制）';
    }
});
hintBtn.addEventListener('click', () => {
    if (busy || session.outcome || !session.humanTurn)
        return;
    const r = chooseMove(session.game.state, {
        ...LEVELS.officer,
        history: session.game.historyKeys,
    });
    if (!r)
        return;
    hint = { from: r.move.from, to: r.move.to };
    render();
    setTimeout(() => {
        hint = null;
        render();
    }, 1600);
});
// ?room=XXXX：从邀请链接直接进房
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
    netPanel.hidden = false;
    netCode.value = roomParam.toUpperCase();
    if (P2P_MODE)
        startP2PJoin(roomParam.toUpperCase());
}
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
    }
    else {
        setTimeout(() => alert(`邀请码无效：${r.error}`), 50);
    }
}
function applySnapshot(snap) {
    const g = new Game(startState([0, 2, 4]));
    for (const mv of snap.moves) {
        const legal = g.legalMoves().find((m) => m.from === mv.from && m.to === mv.to);
        if (legal)
            g.play(legal);
    }
    const side = net?.side ?? 'wolf';
    session = new Session({ humanSide: side, level, wolfCols: [0, 2, 4], game: g });
    myNetTurn = snap.turn === side;
    netStatus.textContent = snap.players.wolf && snap.players.sheep
        ? (myNetTurn ? `轮到你了（你是${side === 'wolf' ? '狼' : '羊'}）` : '等对手走…')
        : `房间 ${snap.id} · 把房号发给朋友`;
    render();
}
function connectRoom(roomId) {
    es?.close();
    es = subscribe(roomId, applySnapshot, () => {
        netStatus.textContent = '连接断开，刷新页面重试';
    });
}
netOpen.addEventListener('click', () => {
    netPanel.hidden = false;
});
netSide.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-ns]');
    if (!t?.dataset.ns)
        return;
    for (const b of netSide.querySelectorAll('button')) {
        b.classList.toggle('active', b === t);
    }
});
function p2pEvents() {
    return {
        onStatus: (txt) => {
            netStatus.textContent = txt;
        },
        onError: (txt) => {
            netStatus.textContent = `连接失败：${txt}。可改用「邀请朋友接着下」`;
        },
        onPeerConnected: () => {
            p2p?.sendCode(session.code());
        },
        onMoveRequest: (from, to) => {
            if (session.playHuman(from, to)) {
                myNetTurn = false;
                p2p?.sendCode(session.code());
                render();
            }
        },
        onState: (code, hostSide) => {
            const r = replayCode(code);
            if (!r.ok)
                return;
            p2pSide = hostSide === 'wolf' ? 'sheep' : 'wolf';
            session = new Session({ humanSide: p2pSide, level, wolfCols: r.layout, game: r.game });
            myNetTurn = session.game.state.turn === (p2pSide === 'wolf' ? 0 : 1);
            netStatus.textContent = myNetTurn ? '轮到你' : '等房主走…';
            render();
        },
    };
}
function startP2PHost(side) {
    if (!peerReady()) {
        netStatus.textContent = '直连组件没加载出来（CDN 被拦），请用「邀请朋友接着下」';
        return;
    }
    p2p?.close();
    p2p = new P2P(p2pEvents());
    p2p.hostSide = side;
    p2pSide = side;
    const code = p2p.host();
    net = { roomId: code, side, token: 'p2p' };
    manual = false;
    session = new Session({ humanSide: side, level, wolfCols: [0, 2, 4] });
    myNetTurn = side === 'wolf';
    netStatus.textContent = `房间 ${code} · 点下面复制邀请链接发给朋友`;
    netCopy.hidden = false;
    render();
}
function startP2PJoin(code) {
    if (!peerReady()) {
        netStatus.textContent = '直连组件没加载出来（CDN 被拦），请用「邀请朋友接着下」';
        return;
    }
    p2p?.close();
    p2p = new P2P(p2pEvents());
    net = { roomId: code, side: 'wolf', token: 'p2p' };
    manual = false;
    myNetTurn = false;
    p2p.join(code);
    netStatus.textContent = '连接中…';
    render();
}
netCreate.addEventListener('click', async () => {
    const active = netSide.querySelector('button.active');
    const side = (active?.dataset.ns ?? 'wolf');
    if (P2P_MODE) {
        startP2PHost(side);
        return;
    }
    try {
        const r = await createRoom(side);
        net = r;
        manual = false;
        netStatus.textContent = `房间 ${r.roomId} · 把房号发给朋友`;
        connectRoom(r.roomId);
    }
    catch (err) {
        netStatus.textContent = err.message;
    }
});
netJoin.addEventListener('click', async () => {
    const code = netCode.value.trim().toUpperCase();
    if (code.length < 4) {
        netStatus.textContent = '房号至少 4 位';
        return;
    }
    if (P2P_MODE) {
        startP2PJoin(code);
        return;
    }
    try {
        const r = await joinRoom(code);
        net = r;
        manual = false;
        connectRoom(r.roomId);
    }
    catch (err) {
        netStatus.textContent = err.message;
    }
});
netClose.addEventListener('click', () => {
    netPanel.hidden = true;
});
netCopy.addEventListener('click', async () => {
    if (!net)
        return;
    const url = `${location.origin}${location.pathname}?room=${net.roomId}`;
    try {
        await navigator.clipboard.writeText(url);
        netCopy.textContent = '已复制，发给朋友';
    }
    catch {
        window.prompt('复制这条链接发给朋友：', url);
    }
    setTimeout(() => { netCopy.textContent = '复制邀请链接'; }, 2000);
});
buildBoard();
render();
if (!session.humanTurn)
    void aiTurn();
//# sourceMappingURL=main.js.map