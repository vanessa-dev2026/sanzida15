import { Session } from './session.js';
import { chooseMove, LEVELS } from '../src/core/ai.js';
import { WOLVES } from '../src/core/moves.js';
import { bits } from '../src/core/board.js';
import { Game, startState } from '../src/core/rules.js';
import { replayCode, shareUrl } from './codec.js';
import { createRoom, joinRoom, sendMove, subscribe } from './net.js';
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
const netLogEl = document.getElementById('net-log');
const netLines = [];
function logNet(line) {
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    netLines.push(`${t} ${line}`);
    if (netLines.length > 8)
        netLines.shift();
    if (netLogEl) {
        netLogEl.textContent = netLines.join('\n');
    }
    else {
        netStatus.style.whiteSpace = 'pre-line';
        netStatus.textContent = netLines.slice(-3).join('\n');
    }
}
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
let hostBeat = null;
function startHostBeat() {
    stopHostBeat();
    hostBeat = setInterval(() => {
        if (p2p?.isHost && net)
            p2p.sendCode(session.code());
    }, 2000);
}
function stopHostBeat() {
    if (hostBeat)
        clearInterval(hostBeat);
    hostBeat = null;
}
let p2pSide = 'wolf';
let es = null;
let myNetTurn = false;
// 手机上点击默认有 300ms 延迟（等双击缩放），关掉它，点一下就响应
document.head.insertAdjacentHTML('beforeend', '<style>.point,button{touch-action:manipulation}</style>');
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
const lastSig = new Array(25).fill('');
function render() {
    const s = session.game.state;
    const wolfSet = new Set(bits(s.wolves));
    const sheepSet = new Set(bits(s.sheep));
    // 只更新变化的格子：原来每步重建全部 DOM，羊多时会掉帧
    for (let i = 0; i < 25; i++) {
        const isW = wolfSet.has(i);
        const isS = sheepSet.has(i);
        const sel = selected === i;
        const hasTarget = targets.has(i);
        const isCapture = hasTarget && targets.get(i) >= 0;
        const isHint = !!hint && (hint.from === i || hint.to === i);
        const sig = `${isW ? 'W' : isS ? 'S' : '-'}${sel ? 1 : 0}${hasTarget ? (isCapture ? 'C' : 'T') : '0'}${isHint ? 1 : 0}`;
        if (lastSig[i] === sig)
            continue;
        lastSig[i] = sig;
        const b = cells[i];
        b.className =
            'point' +
                (isW ? ' wolf' : isS ? ' sheep' : '') +
                (sel ? ' selected' : '') +
                (hasTarget ? (isCapture ? ' capture-target' : ' target') : '') +
                (isHint ? ' hint' : '');
        const want = isW ? '狼' : isS ? '羊' : '';
        const cur = b.firstElementChild;
        if (!want) {
            if (cur)
                b.textContent = '';
        }
        else if (!cur || cur.textContent !== want) {
            b.textContent = '';
            const sp = document.createElement('span');
            sp.className = 'piece';
            sp.textContent = want;
            b.appendChild(sp);
        }
    }
    const turn = s.turn === WOLVES ? '狼' : '羊';
    const mine = session.humanTurn;
    manualBtn.classList.toggle('on', manual);
    if (p2p && net) {
        const role = p2pSide === 'wolf' ? '狼' : '羊';
        statusEl.textContent = session.outcome
            ? '对局结束'
            : !p2p.synced && !p2p.isHost
                ? `联机 · 你执${role} · 同步中…`
                : myNetTurn
                    ? `联机 · 你执${role} · 轮到你`
                    : `联机 · 你执${role} · 等对手`;
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
                // 客机：先本地落子（0 延迟），再发请求；房主确认后以权威局面覆盖
                if (session.playHuman(from, p)) {
                    myNetTurn = false;
                    render();
                }
                p2p.sendMove(from, p);
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
    await new Promise((r) => setTimeout(r, 90));
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
    stopHostBeat();
    lastSig.fill('');
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
        void startP2PJoin(roomParam.toUpperCase());
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
function closeNetPanel() {
    netPanel.hidden = true;
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
/* ---------------- MQTT 中转（公共服务器，免部署） ---------------- */
const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
];
let mqttReady = null;
function ensureMqtt() {
    if (window.mqtt)
        return Promise.resolve(true);
    if (mqttReady)
        return mqttReady;
    mqttReady = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
    return mqttReady;
}
class Relay {
    ev;
    isHost = false;
    hostSide = 'wolf';
    synced = false;
    client = null;
    code = '';
    brokerIndex = 0;
    helloTimer = null;
    constructor(ev) {
        this.ev = ev;
    }
    base() {
        return `szd15/${this.code}/`;
    }
    host() {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++)
            code += alphabet[Math.floor(Math.random() * alphabet.length)];
        this.code = code;
        this.isHost = true;
        this.connect();
        return code;
    }
    join(code) {
        this.code = code.toUpperCase();
        this.isHost = false;
        this.connect();
    }
    connect() {
        const mqtt = window.mqtt;
        const url = BROKERS[this.brokerIndex % BROKERS.length];
        this.ev.onLog?.(`连接中转 ${url}`);
        const client = mqtt.connect(url, {
            connectTimeout: 8000,
            reconnectPeriod: 3000,
            clientId: 'szd-' + Math.random().toString(16).slice(2, 10),
            clean: true,
        });
        this.client = client;
        client.on('connect', () => {
            this.ev.onLog?.('中转已连上');
            if (this.isHost) {
                client.subscribe(this.base() + 'move');
                this.ev.onStatus?.(`房间 ${this.code} · 等朋友连进来`);
            }
            else {
                client.subscribe(this.base() + 'state');
                const ask = () => {
                    try {
                        client.publish(this.base() + 'move', JSON.stringify({ t: 'hello' }));
                    }
                    catch { /* ignore */ }
                };
                ask();
                if (this.helloTimer)
                    clearInterval(this.helloTimer);
                this.helloTimer = setInterval(ask, 3000);
                this.ev.onStatus?.('已连上中转，正在同步棋局…');
            }
        });
        client.on('message', (_topic, payload) => {
            let msg = null;
            try {
                msg = JSON.parse(new TextDecoder().decode(payload));
            }
            catch {
                return;
            }
            if (!msg)
                return;
            if (this.isHost) {
                if (msg.t === 'hello') {
                    this.ev.onLog?.('收到 hello，回发局面');
                    this.ev.onPeerConnected?.();
                }
                else if (msg.t === 'move') {
                    this.ev.onMoveRequest?.(msg.from, msg.to);
                }
            }
            else if (msg.t === 'state') {
                this.synced = true;
                this.ev.onLog?.(`收到局面 code=${msg.code}`);
                this.ev.onState?.(msg.code, msg.side);
            }
        });
        client.on('error', (e) => {
            this.ev.onLog?.(`中转错误：${e?.message ?? e}`);
            this.brokerIndex++;
            if (this.brokerIndex < BROKERS.length * 2) {
                try {
                    this.client?.end(true);
                }
                catch { /* ignore */ }
                setTimeout(() => this.connect(), 500);
            }
            else {
                this.ev.onError?.('中转服务器都连不上');
            }
        });
    }
    sendCode(code) {
        try {
            this.client?.publish(this.base() + 'state', JSON.stringify({ t: 'state', code, side: this.hostSide }));
            this.ev.onLog?.(`发送局面 code=${code}`);
        }
        catch { /* ignore */ }
    }
    sendMove(from, to) {
        try {
            this.client?.publish(this.base() + 'move', JSON.stringify({ t: 'move', from, to }));
        }
        catch { /* ignore */ }
    }
    get connected() {
        return !!this.client?.connected;
    }
    close() {
        if (this.helloTimer)
            clearInterval(this.helloTimer);
        this.helloTimer = null;
        try {
            this.client?.end(true);
        }
        catch { /* ignore */ }
        this.client = null;
    }
}
function p2pEvents() {
    return {
        onStatus: (txt) => {
            netStatus.textContent = txt;
        },
        onError: (txt) => {
            logNet(`错误：${txt}`);
            netStatus.textContent = `连接失败：${txt}。可改用「邀请朋友接着下」`;
        },
        onLog: (txt) => logNet(txt),
        onPeerConnected: () => {
            p2p?.sendCode(session.code());
            closeNetPanel();
        },
        onMoveRequest: (from, to) => {
            // 房主替客机落子：不能用 playHuman（它有"轮到你"的限制）
            const mv = session.game.legalMoves().find((m) => m.from === from && m.to === to);
            if (!mv)
                return;
            session.game.play(mv);
            myNetTurn = true;
            p2p?.sendCode(session.code());
            closeNetPanel();
            render();
        },
        onState: (code, hostSide) => {
            const r = replayCode(code);
            if (!r.ok) {
                netStatus.textContent = `同步失败：${r.error}`;
                return;
            }
            // 忽略比当前更旧的局面（心跳可能乱序到达）
            if (r.game.moves.length < session.moveCount)
                return;
            p2pSide = hostSide === 'wolf' ? 'sheep' : 'wolf';
            session = new Session({ humanSide: p2pSide, level, wolfCols: r.layout, game: r.game });
            myNetTurn = session.game.state.turn === (p2pSide === 'wolf' ? 0 : 1);
            netStatus.textContent =
                `已同步 ${session.moveCount} 步 · 你执${p2pSide === 'wolf' ? '狼' : '羊'} · ` +
                    (myNetTurn ? '轮到你' : '等房主走');
            closeNetPanel();
            render();
        },
    };
}
async function startP2PHost(side) {
    if (!(await ensureMqtt())) {
        netStatus.textContent = '中转组件没加载出来（CDN 被拦），请用「邀请朋友接着下」';
        return;
    }
    p2p?.close();
    p2p = new Relay(p2pEvents());
    p2p.hostSide = side;
    p2pSide = side;
    const code = p2p.host();
    startHostBeat();
    netPanel.hidden = false;
    net = { roomId: code, side, token: 'p2p' };
    manual = false;
    session = new Session({ humanSide: side, level, wolfCols: [0, 2, 4] });
    myNetTurn = side === 'wolf';
    netStatus.textContent = `房间 ${code} · 把房号发给朋友`;
    if (netCopy)
        netCopy.hidden = false;
    render();
}
async function startP2PJoin(code) {
    if (!(await ensureMqtt())) {
        netStatus.textContent = '中转组件没加载出来（CDN 被拦），请用「邀请朋友接着下」';
        return;
    }
    p2p?.close();
    p2p = new Relay(p2pEvents());
    net = { roomId: code, side: 'wolf', token: 'p2p' };
    manual = false;
    myNetTurn = false;
    netStatus.textContent = '连接中…';
    p2p.join(code);
    netStatus.textContent = '连接中…';
    render();
}
netCreate.addEventListener('click', async () => {
    const active = netSide.querySelector('button.active');
    const side = (active?.dataset.ns ?? 'wolf');
    if (P2P_MODE) {
        void startP2PHost(side);
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
        void startP2PJoin(code);
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
netCopy?.addEventListener('click', async () => {
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
