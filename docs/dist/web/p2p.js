/**
 * P2P 直连（GitHub Pages 等纯静态环境用）。
 * 依赖页面上先加载 PeerJS：window.Peer。
 * 连上之后走子直接点对点，不经过服务器。
 */
const PREFIX = 'szd15-';
const ICE = {
    iceServers: [
        { urls: 'stun:stun.miwifi.com:3478' },
        { urls: 'stun:stun.chat.bilibili.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // 公共 TURN 中转：直连打不通时兜底（免费，公开凭据）
        {
            urls: [
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:443',
                'turn:openrelay.metered.ca:443?transport=tcp',
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
        {
            urls: ['turn:turn.anyfirewall.com:443?transport=tcp'],
            username: 'webrtc',
            credential: 'webrtc',
        },
    ],
};
export function peerReady() {
    return typeof window.Peer === 'function';
}
export class P2P {
    ev;
    peer = null;
    conn = null;
    syncTimer = null;
    isHost = false;
    roomCode = '';
    synced = false;
    constructor(ev) {
        this.ev = ev;
    }
    newPeer(id) {
        const Peer = window.Peer;
        return new Peer(id, { debug: 0, config: ICE });
    }
    /** 建房：生成一个 5 位房间号，等人连进来 */
    host() {
        this.isHost = true;
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++)
            code += alphabet[Math.floor(Math.random() * alphabet.length)];
        this.roomCode = code;
        this.peer = this.newPeer(PREFIX + code);
        this.peer.on('open', () => {
            this.ev.onLog?.(`peer open id=${PREFIX + code}`);
            this.ev.onStatus?.(`房间 ${code} · 等朋友连进来`);
        });
        this.peer.on('error', (e) => this.ev.onError?.(String(e?.type ?? e)));
        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.ev.onLog?.('收到对方连接，等通道打开…');
            conn.on('open', () => {
                this.ev.onLog?.('房主侧通道已开，发送局面');
                this.ev.onStatus?.('朋友已连上，开始下棋');
                this.ev.onPeerConnected?.();
            });
            conn.on('data', (d) => {
                const m = d;
                if (m?.t === 'move')
                    this.ev.onMoveRequest?.(m.from, m.to);
                if (m?.t === 'hello') {
                    this.ev.onLog?.('收到 hello，回发局面');
                    this.ev.onPeerConnected?.();
                }
            });
        });
        return code;
    }
    /** 加入别人的房间 */
    join(code) {
        this.isHost = false;
        this.roomCode = code.toUpperCase();
        this.peer = this.newPeer();
        this.peer.on('open', () => {
            this.ev.onStatus?.('连接中…');
            const conn = this.peer.connect(PREFIX + this.roomCode, { reliable: true });
            this.conn = conn;
            conn.on('open', () => {
                this.ev.onLog?.('客机通道已开，发 hello');
                this.ev.onStatus?.('已连上房主，正在同步棋局…');
                const ask = () => {
                    try {
                        conn.send({ t: 'hello' });
                    }
                    catch { /* 忽略 */ }
                };
                ask();
                this.syncTimer = setInterval(() => {
                    if (this.synced) {
                        if (this.syncTimer)
                            clearInterval(this.syncTimer);
                        this.syncTimer = null;
                        return;
                    }
                    ask();
                }, 1500);
            });
            conn.on('data', (d) => {
                const m = d;
                if (m?.t === 'state') {
                    this.synced = true;
                    this.ev.onLog?.(`收到局面 code=${m.code} side=${m.side}`);
                    this.ev.onState?.(m.code, m.side);
                }
            });
            conn.on('error', (e) => this.ev.onError?.(String(e)));
        });
        this.peer.on('error', (e) => this.ev.onError?.(String(e?.type ?? e)));
    }
    hostSide = 'wolf';
    send(m) {
        try {
            if (!this.conn) {
                this.ev.onLog?.('发送失败：还没有连接');
                return false;
            }
            if (!this.conn.open) {
                this.ev.onLog?.('发送失败：通道未打开');
                return false;
            }
            this.conn.send(m);
            return true;
        }
        catch (e) {
            this.ev.onLog?.(`发送异常：${String(e)}`);
            return false;
        }
    }
    sendMove(from, to) {
        this.send({ t: 'move', from, to });
    }
    sendCode(code) {
        const ok = this.send({ t: 'state', code, side: this.hostSide });
        this.ev.onLog?.(`发送局面 code=${code} ok=${ok}`);
    }
    get connected() {
        return !!this.conn?.open;
    }
    close() {
        if (this.syncTimer)
            clearInterval(this.syncTimer);
        this.syncTimer = null;
        this.synced = false;
        try {
            this.conn?.close();
            this.peer?.destroy();
        }
        catch {
            /* 忽略 */
        }
        this.conn = null;
        this.peer = null;
    }
}
//# sourceMappingURL=p2p.js.map
