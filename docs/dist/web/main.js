import { Session } from './session.js';
import { chooseMove, LEVELS } from '../src/core/ai.js';
import { WOLVES } from '../src/core/moves.js';
import { bits } from '../src/core/board.js';
import { Game, startState } from '../src/core/rules.js';
import { replayCode, shareUrl } from './codec.js';
import { isFresher, opposite, reqLabel, sideLabel, undoKeepCount, } from './protocol.js';
/* ================= DOM ================= */
const byId = (id) => document.getElementById(id);
const pointsEl = byId('points');
const statusEl = byId('status');
const counterEl = byId('counter');
const pipsEl = byId('pips');
const playerMe = byId('p-me');
const playerFoe = byId('p-foe');
const meAvatar = byId('av-me');
const foeAvatar = byId('av-foe');
const meSideEl = byId('me-side');
const foeSideEl = byId('foe-side');
const foeNameEl = byId('foe-name');
const vsEl = byId('vs');
const overlay = byId('overlay');
const overlayTitle = byId('overlay-title');
const overlaySub = byId('overlay-sub');
const againBtn = byId('again');
const againSwapBtn = byId('again-swap');
const restartBtn = byId('restart');
const hintBtn = byId('hint');
const undoBtn = byId('undo');
const swapBtn = byId('swap');
const leaveBtn = byId('leave');
const tomatoLayer = byId('tomato-layer');
const roomActions = byId('room-actions');
const manualBtn = byId('manual');
const inviteBtn = byId('invite');
const invitePanel = byId('invite-panel');
const inviteText = byId('invite-text');
const inviteCopy = byId('invite-copy');
const inviteClose = byId('invite-close');
const netOpen = byId('net-open');
const netPanel = byId('net-panel');
const netStatus = byId('net-status');
const netSide = byId('net-side');
const netCreate = byId('net-create');
const netJoin = byId('net-join');
const netCode = byId('net-code');
const netClose = byId('net-close');
const netCopy = byId('net-copy');
const netLogEl = byId('net-log');
const sideSeg = byId('side-seg');
const levelSeg = byId('level-seg');
const toastEl = byId('toast');
const askEl = byId('ask');
const askTitle = byId('ask-title');
const askSub = byId('ask-sub');
const askOk = byId('ask-ok');
const askCancel = byId('ask-cancel');
const placeEl = byId('place');
const placeRow = byId('place-row');
const placeTip = byId('place-tip');
const placeSub = byId('place-sub');
const placeOk = byId('place-ok');
const placeRandom = byId('place-random');
/* ================= 提示 / 弹窗 ================= */
const netLines = [];
function logNet(line) {
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    netLines.push(`${t} ${line}`);
    if (netLines.length > 10)
        netLines.shift();
    if (netLogEl)
        netLogEl.textContent = netLines.join('\n');
}
let toastTimer = null;
function toast(text, ms = 2400) {
    if (!toastEl) {
        statusEl.textContent = text;
        return;
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer)
        clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
        toastTimer = null;
    }, ms);
}
let askResolve = null;
function ask(title, sub, okText = '确定', cancelText = '取消') {
    if (!askEl || !askTitle || !askSub || !askOk || !askCancel) {
        return Promise.resolve(window.confirm(`${title}\n${sub}`));
    }
    if (askResolve) {
        const prev = askResolve;
        askResolve = null;
        prev(false);
    }
    askTitle.textContent = title;
    askSub.textContent = sub;
    askOk.textContent = okText;
    askCancel.textContent = cancelText;
    askEl.hidden = false;
    return new Promise((resolve) => {
        askResolve = resolve;
    });
}
function closeAsk(ok) {
    if (askEl)
        askEl.hidden = true;
    const r = askResolve;
    askResolve = null;
    if (r)
        r(ok);
}
askOk?.addEventListener('click', () => closeAsk(true));
askCancel?.addEventListener('click', () => closeAsk(false));
askEl?.addEventListener('click', (e) => {
    if (e.target === askEl)
        closeAsk(false);
});
/* ================= 状态 ================= */
let side = 'wolf';
let level = 'officer';
const LEVEL_NAME = {
    newbie: '新兵',
    officer: '校尉',
    general: '将军',
};
let manual = false;
let session = new Session({ humanSide: side, level, manual });
let selected = null;
let targets = new Map(); // to -> captured
let hint = null;
let lastMove = null;
let busy = false;
let room = null;
let relay = null;
/** 房主广播的版本号：改一次局面 +1 */
let seq = 0;
/** 局号：重开 / 换边时 +1 */
let round = 0;
/** 客机已接受的版本 */
let peerSeq = -1;
let peerRound = -1;
let pendingReq = null;
let beatTimer = null;
function mySide() {
    return room ? (room.host ? room.hostSide : opposite(room.hostSide)) : side;
}
function turnSide() {
    return session.game.state.turn === WOLVES ? 'wolf' : 'sheep';
}
/** 联机时：客机还没收到第一次局面之前不许动 */
function onlineReady() {
    if (!room)
        return true;
    if (room.host)
        return true;
    return peerSeq >= 0;
}
function myTurn() {
    return !session.outcome && onlineReady() && turnSide() === mySide();
}
function canTouchBoard() {
    if (room)
        return myTurn();
    if (manual)
        return !session.outcome;
    return session.humanTurn && !session.outcome;
}
/* ================= 棋盘渲染 ================= */
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
let flash = null;
let flashTimer = null;
function flashMove(from, to, mine) {
    flash = { from, to, mine };
    if (flashTimer)
        clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
        flash = null;
        flashTimer = null;
        render();
    }, 800);
    render();
}
const lastSig = new Array(25).fill('');
function render() {
    const s = session.game.state;
    const wolfSet = new Set(bits(s.wolves));
    const sheepSet = new Set(bits(s.sheep));
    // 只更新变化的格子：每步重建全部 DOM 会掉帧
    for (let i = 0; i < 25; i++) {
        const isW = wolfSet.has(i);
        const isS = sheepSet.has(i);
        const sel = selected === i;
        const hasTarget = targets.has(i);
        const isCapture = hasTarget && targets.get(i) >= 0;
        const isHint = !!hint && (hint.from === i || hint.to === i);
        const last = lastMove === null ? '' : lastMove.from === i ? 'f' : lastMove.to === i ? 't' : '';
        const flashCls = flash && flash.to === i ? (flash.mine ? 'M' : 'O') : flash && flash.from === i ? 'F' : '';
        const sig = `${isW ? 'W' : isS ? 'S' : '-'}${sel ? 1 : 0}${hasTarget ? (isCapture ? 'C' : 'T') : '0'}${isHint ? 1 : 0}${flashCls}${last}`;
        if (lastSig[i] === sig)
            continue;
        lastSig[i] = sig;
        const b = cells[i];
        b.className =
            'point' +
                (isW ? ' wolf' : isS ? ' sheep' : '') +
                (sel ? ' selected' : '') +
                (hasTarget ? (isCapture ? ' capture-target' : ' target') : '') +
                (isHint ? ' hint' : '') +
                (last === 'f' ? ' lm-from' : last === 't' ? ' lm-to' : '') +
                (flashCls === 'M' ? ' flash-mine' : flashCls === 'O' ? ' flash-opp' : '');
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
    renderStatus();
    renderPips();
    syncHud();
    renderOverlay();
}
function renderStatus() {
    const ts = turnSide();
    const me = mySide();
    let text;
    if (session.outcome) {
        text = '对局结束';
    }
    else if (room) {
        if (waitingPlace) {
            text = '联机 · 等对方摆狼…';
        }
        else if (pendingPlace) {
            text = '联机 · 摆狼中…';
        }
        else if (pendingReq) {
            text = `已请求${reqLabel(pendingReq.act)}，等对方同意…`;
        }
        else if (!onlineReady()) {
            text = '联机 · 正在同步棋局…';
        }
        else if (myTurn()) {
            text = `联机 · 你执${sideLabel(me)} · 轮到你`;
        }
        else {
            text = `联机 · 你执${sideLabel(me)} · 等对方`;
        }
    }
    else if (manual) {
        text = `双人对战 · ${sideLabel(ts)}走`;
    }
    else if (busy) {
        text = `${sideLabel(ts)}方 AI 思考中…`;
    }
    else {
        text = `你执${sideLabel(me)} · ${session.humanTurn ? '轮到你' : 'AI 思考中'}`;
    }
    statusEl.textContent = text;
    counterEl.textContent = `羊 ${session.sheepLeft}/15 · ${session.moveCount} 步`;
}
function renderPips() {
    if (!pipsEl)
        return;
    if (pipsEl.children.length !== 15) {
        pipsEl.textContent = '';
        for (let i = 0; i < 15; i++) {
            const d = document.createElement('i');
            d.className = 'pip';
            pipsEl.appendChild(d);
        }
    }
    const left = session.sheepLeft;
    for (let i = 0; i < 15; i++) {
        pipsEl.children[i].classList.toggle('out', i >= left);
    }
}
function renderOverlay() {
    const o = session.outcome;
    if (!o) {
        overlay.hidden = true;
        return;
    }
    overlay.hidden = false;
    overlayTitle.textContent = o === 'wolf' ? '狼胜' : o === 'sheep' ? '羊胜' : '和棋';
    overlaySub.textContent =
        o === 'wolf'
            ? `吃掉了 ${15 - session.sheepLeft} 只羊`
            : o === 'sheep'
                ? '三只狼全部被围死'
                : '三次重复局面';
}
function syncHud() {
    const me = mySide();
    const foe = opposite(me);
    for (const b of sideSeg.querySelectorAll('button')) {
        b.classList.toggle('active', b.dataset.side === me);
        b.disabled = !!room;
    }
    levelSeg.hidden = !!room;
    manualBtn.classList.toggle('on', manual);
    if (roomActions)
        roomActions.hidden = !room;
    if (meSideEl)
        meSideEl.textContent = `执${sideLabel(me)}`;
    if (foeSideEl)
        foeSideEl.textContent = `执${sideLabel(foe)}`;
    if (foeNameEl) {
        foeNameEl.textContent = room ? '朋友' : manual ? '对手' : `电脑 · ${LEVEL_NAME[level]}`;
    }
    if (vsEl)
        vsEl.textContent = room ? `房间 ${room.code}` : manual ? '双人' : '人机';
    const live = !session.outcome;
    const meNow = live && turnSide() === me;
    playerMe?.classList.toggle('turn', meNow);
    playerFoe?.classList.toggle('turn', live && !meNow);
    playerFoe?.classList.toggle('tossable', live && !meNow && !manual);
}
function refreshAll() {
    lastSig.fill('');
    render();
}
function clearSelection() {
    selected = null;
    targets.clear();
}
/* ================= 走子 ================= */
function playLegal(from, to) {
    const mv = session.game.legalMoves().find((m) => m.from === from && m.to === to);
    if (!mv)
        return null;
    session.game.play(mv);
    return mv;
}
function onPoint(p) {
    if (busy || session.outcome)
        return;
    if (!canTouchBoard()) {
        if (room && onlineReady() && !myTurn())
            toast('等对方走完');
        return;
    }
    if (selected !== null && targets.has(p)) {
        commitMove(selected, p);
        return;
    }
    const ts = turnSide();
    const own = ts === 'wolf' ? isWolf(p) : isSheep(p);
    if (own) {
        const ms = session.movesFrom(p);
        selected = ms.length ? p : null;
        targets = new Map(ms.map((m) => [m.to, m.captured]));
        if (!ms.length)
            toast('这个子没有可走的位置', 1400);
    }
    else {
        clearSelection();
    }
    render();
}
function commitMove(from, to) {
    clearSelection();
    hint = null;
    if (room) {
        const mv = playLegal(from, to);
        if (!mv) {
            render();
            return;
        }
        lastMove = { from, to };
        flashMove(from, to, true);
        if (room.host) {
            seq++;
            publishState();
        }
        else {
            relay?.sendMove(from, to);
        }
        render();
        return;
    }
    if (!session.playHuman(from, to)) {
        render();
        return;
    }
    lastMove = { from, to };
    render();
    void aiTurn();
}
async function aiTurn() {
    if (room)
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
    const before = session.moveCount;
    session.playAi();
    busy = false;
    const lastAi = session.game.moves[session.game.moves.length - 1];
    if (session.moveCount > before && lastAi) {
        lastMove = { from: lastAi.from, to: lastAi.to };
        flashMove(lastAi.from, lastAi.to, false);
    }
    render();
    if (!session.humanTurn && !session.outcome)
        void aiTurn();
}
/* ================= 开局摆狼 ================= */
const PLACE_MS = 30_000;
const DEFAULT_COLS = [1, 2, 3];
let placeCells = [];
let placeSel = new Set(DEFAULT_COLS);
let placeTimer = null;
let placeDeadline = 0;
let placeOpen = false;
/** 联机：这一局的狼位还没定 */
let pendingPlace = false;
/** 我不是摆狼的人，等对方摆 */
let waitingPlace = false;
let placeWatchdog = null;
function buildPlaceRow() {
    if (!placeRow || placeCells.length)
        return;
    for (let c = 0; c < 5; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'place-cell';
        b.dataset.c = String(c);
        b.addEventListener('click', () => togglePlace(c));
        placeRow.appendChild(b);
        placeCells.push(b);
    }
}
function chosenCols() {
    if (placeSel.size !== 3)
        return null;
    const a = [...placeSel].sort((x, y) => x - y);
    return [a[0], a[1], a[2]];
}
function paintPlace() {
    for (let c = 0; c < 5; c++) {
        const b = placeCells[c];
        if (!b)
            continue;
        const on = placeSel.has(c);
        b.classList.toggle('on', on);
        b.textContent = on ? '狼' : '';
    }
    if (placeOk)
        placeOk.disabled = placeSel.size !== 3;
}
function togglePlace(c) {
    if (placeSel.has(c))
        placeSel.delete(c);
    else if (placeSel.size < 3)
        placeSel.add(c);
    paintPlace();
}
function openPlacement() {
    if (!placeEl) {
        // 老页面没有这个弹窗时的兜底
        confirmPlacement(DEFAULT_COLS);
        return;
    }
    if (placeOpen)
        return;
    buildPlaceRow();
    placeSel = new Set(DEFAULT_COLS);
    paintPlace();
    if (placeSub) {
        placeSub.textContent =
            room && !room.host
                ? '你执狼：点最上一排挑 3 个起始位置，选好就等房主开棋'
                : '点最上一排的格子，挑 3 个位置放狼';
    }
    placeEl.hidden = false;
    placeOpen = true;
    waitingPlace = false;
    placeDeadline = Date.now() + PLACE_MS;
    if (placeTimer)
        clearInterval(placeTimer);
    placeTimer = setInterval(tickPlacement, 200);
    tickPlacement();
    render();
}
function tickPlacement() {
    const left = Math.max(0, Math.ceil((placeDeadline - Date.now()) / 1000));
    if (placeTip) {
        placeTip.textContent = `还剩 ${left} 秒 · 超时按 2·3·4 列开局`;
        placeTip.classList.toggle('warn', left <= 5);
    }
    if (left <= 0)
        confirmPlacement(chosenCols() ?? DEFAULT_COLS);
}
function closePlacement() {
    if (placeTimer)
        clearInterval(placeTimer);
    placeTimer = null;
    placeOpen = false;
    if (placeEl)
        placeEl.hidden = true;
}
function confirmPlacement(cols) {
    closePlacement();
    if (room && !room.host) {
        relay?.sendLayout(cols);
        toast('已选好，等房主开棋…', 2400);
        return;
    }
    applyLayout(cols);
}
function stopPlaceWatchdog() {
    if (placeWatchdog)
        clearTimeout(placeWatchdog);
    placeWatchdog = null;
}
function startPlaceWatchdog() {
    stopPlaceWatchdog();
    placeWatchdog = setTimeout(() => {
        placeWatchdog = null;
        if (pendingPlace && waitingPlace && room?.host) {
            toast('对方一直没摆狼，按 2·3·4 列开始', 3000);
            applyLayout(DEFAULT_COLS);
        }
    }, 45_000);
}
/** AI 执狼时的摆法：新兵乱摆，其余用默认的 2·3·4 */
function aiLayout() {
    if (level !== 'newbie')
        return DEFAULT_COLS;
    return randomCols();
}
function randomCols() {
    const pool = [0, 1, 2, 3, 4];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const a = pool.slice(0, 3).sort((x, y) => x - y);
    return [a[0], a[1], a[2]];
}
/* ================= 一局的生命周期 ================= */
function resetBoard(cols) {
    session = new Session({
        humanSide: mySide(),
        level,
        manual: room ? false : manual,
        wolfCols: cols,
    });
    clearSelection();
    hint = null;
    lastMove = null;
    busy = false;
}
/** 开新的一局：局号 +1，先摆狼 */
function beginRound() {
    pendingReq = null;
    round++;
    seq++;
    pendingPlace = true;
    waitingPlace = false;
    closePlacement();
    resetBoard(DEFAULT_COLS);
    refreshAll();
    if (mySide() === 'wolf' && (!room || onlineReady())) {
        if (room?.host)
            publishState(); // 告诉客人"这一局还没定狼位"
        openPlacement();
        return;
    }
    if (room) {
        if (room.host) {
            publishState();
            startPlaceWatchdog();
        }
        waitingPlace = true;
        render();
        return;
    }
    // 人机：AI 执狼，自己摆完就开
    applyLayout(aiLayout());
}
/** 狼位定了，正式开棋 */
function applyLayout(cols) {
    stopPlaceWatchdog();
    closePlacement();
    pendingPlace = false;
    waitingPlace = false;
    seq++;
    resetBoard(cols);
    refreshAll();
    if (room?.host)
        publishState();
    if (!room && !session.humanTurn)
        void aiTurn();
}
function newGame() {
    beginRound();
}
/** 把当前对局退回到第 keep 步之后的局面 */
function rebuild(keep) {
    const cols = session.wolfCols;
    const src = session.game.moves.slice();
    const g = new Game(startState(cols));
    for (let i = 0; i < keep && i < src.length; i++) {
        const mv = src[i];
        const legal = g.legalMoves().find((m) => m.from === mv.from && m.to === mv.to);
        if (legal)
            g.play(legal);
    }
    session = new Session({ humanSide: mySide(), level, manual, wolfCols: cols, game: g });
}
function setSide(next) {
    side = next;
    newGame();
    syncHud();
}
function setLevel(next) {
    level = next;
    session.level = next;
    for (const b of levelSeg.querySelectorAll('button')) {
        b.classList.toggle('active', b.dataset.level === next);
    }
}
/* ================= 悔棋 / 重开 / 换边 ================= */
function undoLocal() {
    if (busy)
        return;
    if (!session.canUndo) {
        toast('没有可悔的棋');
        return;
    }
    session.undo();
    // 人机对战：一直退到轮到自己，否则玩家会卡住
    if (!manual) {
        while (session.canUndo && !session.humanTurn)
            session.undo();
    }
    clearSelection();
    hint = null;
    lastMove = session.game.moves[session.game.moves.length - 1] ?? null;
    render();
}
async function doUndo() {
    if (busy || session.outcome)
        return;
    if (room) {
        if (session.moveCount === 0) {
            toast('还没有棋子可以悔');
            return;
        }
        const keep = undoKeepCount(session.moveCount, mySide());
        if (keep < 0) {
            toast('还没有棋子可以悔');
            return;
        }
        if (!relay?.peerOnline) {
            toast('对方还没连进来');
            return;
        }
        sendReq('undo', keep);
        return;
    }
    undoLocal();
}
async function requestRestart() {
    if (room) {
        if (session.moveCount === 0 && !session.outcome) {
            if (room.host)
                beginRound();
            else if (relay?.peerOnline)
                sendReq('restart');
            else
                toast('还没连上开房的人');
            return;
        }
        if (!relay?.peerOnline) {
            if (room.host) {
                const ok = await ask('重开一局', '棋局正在进行，朋友还没连上。确定重开吗？', '重开', '取消');
                if (ok)
                    beginRound();
            }
            else {
                toast('还没连上开房的人');
            }
            return;
        }
        sendReq('restart');
        return;
    }
    if (session.moveCount > 0 && !session.outcome) {
        const ok = await ask('重开一局', '棋局正在进行，确定要重开吗？', '重开', '取消');
        if (!ok)
            return;
    }
    newGame();
}
async function requestSwap() {
    if (room) {
        if (!relay?.peerOnline) {
            toast(room.host ? '朋友还没连进来' : '还没连上开房的人');
            return;
        }
        sendReq('swap');
        return;
    }
    if (session.moveCount > 0 && !session.outcome) {
        const next = opposite(mySide());
        const ok = await ask('换边', `确定改成执${sideLabel(next)}并重开一局吗？`, '换边重开', '取消');
        if (!ok)
            return;
        setSide(next);
        return;
    }
    setSide(opposite(mySide()));
}
/* ================= 扔番茄（催对方快点） ================= */
let tomatoReadyAt = 0;
function throwTomato() {
    if (manual)
        return;
    if (session.outcome)
        return;
    if (room) {
        if (!relay?.peerOnline) {
            toast('对方还没连进来');
            return;
        }
        if (myTurn()) {
            toast('轮到你了，先走棋');
            return;
        }
    }
    const now = Date.now();
    if (now < tomatoReadyAt) {
        const left = Math.ceil((tomatoReadyAt - now) / 1000);
        toast(`别急，${left} 秒后才能再扔`);
        return;
    }
    tomatoReadyAt = now + (room ? 6000 : 3000);
    if (room)
        relay?.sendTomato();
    playTomato(true);
    toast(room ? '番茄扔过去了，等对方走棋' : '糊到电脑脸上了', 1700);
}
function onPeerTomato() {
    playTomato(false);
    toast('对方嫌你慢，扔了个番茄', 2600);
    const nav = navigator;
    try {
        nav.vibrate?.(60);
    }
    catch {
        /* ignore */
    }
}
/** 番茄从自己头像飞到对方头像，糊上去 */
function playTomato(mine) {
    const layer = tomatoLayer;
    const from = mine ? meAvatar : foeAvatar;
    const to = mine ? foeAvatar : meAvatar;
    if (!layer || !from || !to || typeof from.getBoundingClientRect !== 'function')
        return;
    const ra = from.getBoundingClientRect();
    const rb = to.getBoundingClientRect();
    const sx = ra.left + ra.width / 2;
    const sy = ra.top + ra.height / 2;
    const tx = rb.left + rb.width / 2;
    const ty = rb.top + rb.height * 0.55;
    const tomato = document.createElement('div');
    tomato.className = 'tomato';
    tomato.style.left = `${sx}px`;
    tomato.style.top = `${sy}px`;
    const style = tomato.style;
    style.setProperty?.('--dx', `${tx - sx}px`);
    style.setProperty?.('--dy', `${ty - sy}px`);
    layer.appendChild(tomato);
    window.setTimeout(() => {
        if (tomato.parentNode)
            tomato.parentNode.removeChild(tomato);
        const splat = document.createElement('div');
        splat.className = 'splat';
        splat.style.left = `${tx}px`;
        splat.style.top = `${ty}px`;
        layer.appendChild(splat);
        to.classList.remove('hit');
        // 强制重播动画
        void to.offsetWidth;
        to.classList.add('hit');
        window.setTimeout(() => {
            to.classList.remove('hit');
            if (splat.parentNode)
                splat.parentNode.removeChild(splat);
        }, 1000);
    }, 560);
}
/* ================= 联机：MQTT 中转 ================= */
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
/**
 * 借公用的 MQTT 服务器做中转，双方各订阅一个主题：
 *   房主订阅 szd15/<房号>/move   —— 收客人的走子和请求
 *   客机订阅 szd15/<房号>/state  —— 收房主的局面和应答
 */
class Relay {
    ev;
    isHost = false;
    hostSide = 'wolf';
    synced = false;
    /** 对方是否真的连上了（发过 hello / 收到过局面） */
    peerOnline = false;
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
    get inTopic() {
        return this.base() + (this.isHost ? 'move' : 'state');
    }
    get outTopic() {
        return this.base() + (this.isHost ? 'state' : 'move');
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
            client.subscribe(this.inTopic);
            if (this.isHost) {
                this.ev.onStatus?.(`房间 ${this.code} · 等朋友连进来`);
                return;
            }
            const ask = () => {
                try {
                    client.publish(this.base() + 'move', JSON.stringify({ t: 'hello' }));
                }
                catch {
                    /* ignore */
                }
            };
            ask();
            if (this.helloTimer)
                clearInterval(this.helloTimer);
            this.helloTimer = setInterval(ask, 2500);
            this.ev.onStatus?.('已连上中转，正在同步棋局…');
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
            this.dispatch(msg);
        });
        client.on('error', (e) => {
            this.ev.onLog?.(`中转错误：${e?.message ?? e}`);
            this.brokerIndex++;
            if (this.brokerIndex < BROKERS.length * 2) {
                try {
                    this.client?.end(true);
                }
                catch {
                    /* ignore */
                }
                setTimeout(() => this.connect(), 400);
            }
            else {
                this.ev.onError?.('中转服务器都连不上，换个网络再试');
            }
        });
    }
    dispatch(msg) {
        if (this.isHost) {
            if (msg.t === 'hello') {
                // 客人会反复发 hello 直到拿到局面，只在第一次提示"连上了"
                const first = !this.peerOnline;
                this.peerOnline = true;
                if (first) {
                    this.ev.onLog?.('收到 hello，回发局面');
                    this.ev.onPeer?.(true);
                }
            }
            else if (msg.t === 'move') {
                this.ev.onMove?.(msg.from, msg.to);
            }
            else if (msg.t === 'layout') {
                this.ev.onLog?.(`收到狼位 ${msg.cols.join(',')}`);
                this.ev.onLayout?.(msg.cols);
            }
            else if (msg.t === 'tomato') {
                this.ev.onTomato?.();
            }
            else if (msg.t === 'req') {
                this.ev.onLog?.(`收到请求 ${msg.act}`);
                this.ev.onReq?.(msg.act, msg.id, msg.keep);
            }
            else if (msg.t === 'res') {
                this.ev.onRes?.(msg.id, msg.ok);
            }
            return;
        }
        if (msg.t === 'state') {
            this.synced = true;
            this.peerOnline = true;
            if (this.helloTimer) {
                clearInterval(this.helloTimer);
                this.helloTimer = null;
            }
            this.ev.onState?.(msg);
        }
        else if (msg.t === 'tomato') {
            this.peerOnline = true;
            this.ev.onTomato?.();
        }
        else if (msg.t === 'req') {
            this.peerOnline = true;
            this.ev.onLog?.(`收到请求 ${msg.act}`);
            this.ev.onReq?.(msg.act, msg.id, msg.keep);
        }
        else if (msg.t === 'res') {
            this.peerOnline = true;
            this.ev.onRes?.(msg.id, msg.ok);
        }
    }
    pub(msg) {
        try {
            this.client?.publish(this.outTopic, JSON.stringify(msg));
            return true;
        }
        catch {
            return false;
        }
    }
    sendState(m) {
        this.pub(m);
    }
    sendMove(from, to) {
        this.pub({ t: 'move', from, to });
    }
    sendLayout(cols) {
        this.pub({ t: 'layout', cols });
    }
    sendTomato() {
        this.pub({ t: 'tomato' });
    }
    sendReq(act, id, keep) {
        this.pub({ t: 'req', act, id, keep });
    }
    sendRes(id, ok) {
        this.pub({ t: 'res', id, ok });
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
        catch {
            /* ignore */
        }
        this.client = null;
    }
}
function publishState() {
    if (!relay || !room?.host)
        return;
    relay.sendState({
        t: 'state',
        code: session.code(),
        side: room.hostSide,
        seq,
        round,
        pending: pendingPlace,
    });
}
function startBeat() {
    stopBeat();
    beatTimer = setInterval(() => {
        if (room?.host)
            publishState();
    }, 2000);
}
function stopBeat() {
    if (beatTimer)
        clearInterval(beatTimer);
    beatTimer = null;
}
function resetNet() {
    stopBeat();
    relay?.close();
    relay = null;
    room = null;
    pendingReq = null;
    peerSeq = -1;
    peerRound = -1;
    if (netCopy)
        netCopy.hidden = true;
}
function closeNetPanel() {
    netPanel.hidden = true;
}
function relayEvents() {
    return {
        onStatus: (t) => {
            netStatus.textContent = t;
        },
        onError: (t) => {
            logNet(`错误：${t}`);
            netStatus.textContent = `连接失败：${t}`;
        },
        onLog: logNet,
        onPeer: (connected) => {
            if (!connected)
                return;
            if (room?.host) {
                toast(`朋友已连上：你执${sideLabel(room.hostSide)}，对方执${sideLabel(opposite(room.hostSide))}`, 3200);
            }
            closeNetPanel();
            startBeat();
            publishState();
            render();
        },
        onState: (m) => applyPeerState(m),
        onMove: (from, to) => onPeerMove(from, to),
        onLayout: (cols) => onPeerLayout(cols),
        onTomato: () => onPeerTomato(),
        onReq: (act, id, keep) => {
            void onPeerReq(act, id, keep);
        },
        onRes: (id, ok) => onPeerRes(id, ok),
    };
}
/** 房主：客人（执狼）传来他摆的狼位 */
function onPeerLayout(cols) {
    if (!room?.host)
        return;
    applyLayout(cols);
}
/** 客机：收到房主的权威局面 */
function applyPeerState(m) {
    if (!room || room.host)
        return;
    const r = replayCode(m.code);
    if (!r.ok) {
        netStatus.textContent = `同步失败：${r.error}`;
        return;
    }
    let fresh = peerRound < 0 || isFresher({ round: m.round, seq: m.seq }, { round: peerRound, seq: peerSeq });
    // 心跳重发的同一版本：如果步数对不上，说明我这边多走了一步（消息丢了），以房主为准
    if (!fresh && m.round === peerRound && m.seq === peerSeq && r.game.moves.length !== session.moveCount) {
        fresh = true;
    }
    if (!fresh)
        return;
    const first = peerRound < 0;
    const newRound = !first && m.round !== peerRound;
    const prevCount = session.moveCount;
    peerRound = m.round;
    peerSeq = m.seq;
    round = m.round;
    room.hostSide = m.side;
    side = opposite(m.side);
    session = new Session({ humanSide: side, level, manual: false, wolfCols: r.layout, game: r.game });
    if (first || newRound) {
        clearSelection();
        hint = null;
        lastMove = null;
        pendingReq = null;
    }
    refreshAll();
    // 这一局还在摆狼阶段
    if (m.pending) {
        pendingPlace = true;
        if (mySide() === 'wolf') {
            waitingPlace = false;
            if (!placeOpen)
                openPlacement();
            render();
        }
        else {
            waitingPlace = true;
            closePlacement();
            render();
        }
        if (first)
            closeNetPanel();
        return;
    }
    pendingPlace = false;
    if (waitingPlace || placeOpen) {
        waitingPlace = false;
        closePlacement();
    }
    const moves = r.game.moves;
    const last = moves[moves.length - 1];
    if (!first && !newRound && last && moves.length === prevCount + 1) {
        lastMove = { from: last.from, to: last.to };
        flashMove(last.from, last.to, false);
    }
    else if (!first && moves.length < prevCount) {
        toast('刚才那步没送到，请再走一次', 2600);
    }
    if (newRound)
        toast('新的一局开始了', 2000);
    if (first) {
        toast(`开房人执${sideLabel(room.hostSide)}，你自动执${sideLabel(side)}`, 3600);
        netStatus.textContent = `已连上 · 开房人执${sideLabel(room.hostSide)} · 你执${sideLabel(side)}`;
        closeNetPanel();
    }
}
/** 房主：客人走了一步 */
function onPeerMove(from, to) {
    if (!room?.host)
        return;
    const mv = playLegal(from, to);
    if (!mv) {
        // 两边不一致时用权威局面把对方纠正回来
        publishState();
        return;
    }
    lastMove = { from, to };
    seq++;
    publishState();
    flashMove(from, to, false);
    render();
}
/* ================= 请求 / 同意 ================= */
function sendReq(act, keep = -1) {
    if (!relay?.peerOnline) {
        toast('对方还没连进来');
        return;
    }
    if (pendingReq) {
        toast('上一个请求还没回应');
        return;
    }
    const id = Math.random().toString(36).slice(2, 8);
    pendingReq = { act, id, keep };
    relay.sendReq(act, id, keep);
    toast(`已发出「${reqLabel(act)}」请求，等对方同意…`, 4000);
    render();
    setTimeout(() => {
        if (pendingReq?.id === id) {
            pendingReq = null;
            toast('对方没有回应', 2200);
            render();
        }
    }, 20000);
}
async function onPeerReq(act, id, keep) {
    let detail = reqLabel(act);
    if (act === 'undo') {
        const back = Math.max(1, session.moveCount - keep);
        detail = `悔棋（退回 ${back} 步）`;
    }
    else if (act === 'swap') {
        detail = '互换阵营（会立刻开新的一局）';
    }
    else if (act === 'restart') {
        detail = '重开一局';
    }
    const ok = await ask('对方的请求', `对方想${detail}，你同意吗？`, '同意', '不同意');
    relay?.sendRes(id, ok);
    if (!ok)
        return;
    if (room?.host) {
        hostApply(act, keep);
    }
    else {
        toast('已同意，等房主同步…', 2000);
    }
}
function onPeerRes(id, ok) {
    if (!pendingReq || pendingReq.id !== id)
        return;
    const { act, keep } = pendingReq;
    pendingReq = null;
    if (!ok) {
        toast('对方不同意');
        render();
        return;
    }
    toast('对方同意了', 1600);
    if (room?.host)
        hostApply(act, keep);
    render();
}
/** 房主执行被同意的操作 */
function hostApply(act, keep) {
    if (!room?.host)
        return;
    if (act === 'swap') {
        room.hostSide = opposite(room.hostSide);
        side = room.hostSide;
        beginRound();
        toast(`已互换：你现在执${sideLabel(side)}`, 3000);
        return;
    }
    if (act === 'restart') {
        beginRound();
        toast('已重开一局', 1800);
        return;
    }
    if (session.moveCount === 0)
        return;
    const k = Math.max(0, Math.min(keep, session.moveCount - 1));
    rebuild(k);
    seq++;
    clearSelection();
    hint = null;
    lastMove = session.game.moves[session.game.moves.length - 1] ?? null;
    publishState();
    render();
    toast(`已悔棋，当前 ${session.moveCount} 步`, 1800);
}
/* ================= 开房 / 加入 / 退出 ================= */
async function createGame(hostSide) {
    if (!(await ensureMqtt())) {
        netStatus.textContent = '联机组件没加载出来（网络可能被拦），换个网络或刷新再试';
        return;
    }
    resetNet();
    relay = new Relay(relayEvents());
    relay.isHost = true;
    relay.hostSide = hostSide;
    const code = relay.host();
    room = { code, host: true, hostSide };
    side = hostSide;
    manual = false;
    seq = 0;
    round = 0;
    peerSeq = -1;
    peerRound = -1;
    beginRound();
    netCode.value = code;
    if (netCopy) {
        netCopy.hidden = false;
        netCopy.textContent = '复制邀请链接';
    }
    netStatus.textContent = `房间 ${code} · 你执${sideLabel(hostSide)}，朋友会执${sideLabel(opposite(hostSide))}`;
    startBeat();
    publishState();
    refreshAll();
}
async function joinGame(code) {
    if (!(await ensureMqtt())) {
        netStatus.textContent = '联机组件没加载出来（网络可能被拦），换个网络或刷新再试';
        return;
    }
    resetNet();
    relay = new Relay(relayEvents());
    relay.isHost = false;
    relay.join(code);
    room = { code, host: false, hostSide: 'wolf' };
    manual = false;
    netCode.value = code;
    netStatus.textContent = `正在进入房间 ${code}…`;
    refreshAll();
}
function leaveRoom() {
    const was = mySide();
    resetNet();
    side = was;
    newGame();
    closeNetPanel();
    toast('已退出房间');
}
/* ================= 按钮绑定 ================= */
sideSeg.addEventListener('click', (e) => {
    if (room)
        return;
    const t = e.target.closest('button[data-side]');
    if (t?.dataset.side)
        setSide(t.dataset.side);
});
levelSeg.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-level]');
    if (t?.dataset.level)
        setLevel(t.dataset.level);
});
restartBtn.addEventListener('click', () => {
    void requestRestart();
});
againBtn.addEventListener('click', () => {
    void requestRestart();
});
againSwapBtn?.addEventListener('click', () => {
    void requestSwap();
});
placeOk?.addEventListener('click', () => {
    confirmPlacement(chosenCols() ?? DEFAULT_COLS);
});
placeRandom?.addEventListener('click', () => {
    placeSel = new Set(randomCols());
    paintPlace();
});
undoBtn.addEventListener('click', () => {
    void doUndo();
});
swapBtn?.addEventListener('click', () => {
    void requestSwap();
});
playerFoe?.addEventListener('click', () => {
    throwTomato();
});
leaveBtn?.addEventListener('click', () => {
    leaveRoom();
});
manualBtn.addEventListener('click', () => {
    if (room) {
        toast('联机时不能切双人对战');
        return;
    }
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
    if (busy || session.outcome || !canTouchBoard())
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
netOpen.addEventListener('click', () => {
    netPanel.hidden = false;
    if (room) {
        if (netCopy)
            netCopy.hidden = false;
        netStatus.textContent = room.host
            ? `房间 ${room.code} · 你执${sideLabel(mySide())}，朋友会执${sideLabel(opposite(mySide()))}`
            : `房间 ${room.code} · 开房人执${sideLabel(room.hostSide)} · 你执${sideLabel(mySide())}`;
    }
});
netSide.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-ns]');
    if (!t?.dataset.ns)
        return;
    for (const b of netSide.querySelectorAll('button')) {
        b.classList.toggle('active', b === t);
    }
});
netCreate.addEventListener('click', () => {
    const active = netSide.querySelector('button.active');
    const chosen = (active?.dataset.ns ?? 'wolf');
    void createGame(chosen);
});
netJoin.addEventListener('click', () => {
    const code = netCode.value.trim().toUpperCase();
    if (code.length < 4) {
        netStatus.textContent = '房号至少 4 位';
        return;
    }
    void joinGame(code);
});
netClose.addEventListener('click', () => {
    closeNetPanel();
});
netCopy?.addEventListener('click', async () => {
    if (!room)
        return;
    const url = `${location.origin}${location.pathname}?room=${room.code}`;
    try {
        await navigator.clipboard.writeText(url);
        netCopy.textContent = '已复制，发给朋友';
    }
    catch {
        window.prompt('复制这条链接发给朋友：', url);
    }
    setTimeout(() => {
        if (netCopy)
            netCopy.textContent = '复制邀请链接';
    }, 2000);
});
/* ================= 启动 ================= */
// ?room=XXXX：从邀请链接直接进房
const roomParam = new URLSearchParams(location.search).get('room');
// #g=...：从"邀请朋友接着下"的链接恢复棋局
const hash = location.hash.match(/#g=([0-9a-z]+)/i);
buildBoard();
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
refreshAll();
if (roomParam) {
    netPanel.hidden = false;
    netCode.value = roomParam.toUpperCase();
    void joinGame(roomParam.toUpperCase());
}
else if (!hash) {
    beginRound();
}
//# sourceMappingURL=main.js.map
