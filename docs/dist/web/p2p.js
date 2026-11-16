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
    isHost = false;
    roomCode = '';
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
        this.peer.on('open', () => this.ev.onStatus?.(`房间 ${code} · 等朋友连进来`));
        this.peer.on('error', (e) => this.ev.onError?.(String(e?.type ?? e)));
        this.peer.on('connection', (conn) => {
            this.conn = conn;
            conn.on('open', () => {
                this.ev.onStatus?.('朋友已连上，开始下棋');
                this.ev.onPeerConnected?.();
            });
            conn.on('data', (d) => {
                const m = d;
                if (m?.t === 'move')
                    this.ev.onMoveRequest?.(m.from, m.to);
                if (m?.t === 'hello')
                    this.ev.onPeerConnected?.();
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
                this.ev.onStatus?.('已连上房主，开始下棋');
                conn.send({ t: 'hello' });
            });
            conn.on('data', (d) => {
                const m = d;
                if (m?.t === 'state')
                    this.ev.onState?.(m.code, m.side);
            });
            conn.on('error', (e) => this.ev.onError?.(String(e)));
        });
        this.peer.on('error', (e) => this.ev.onError?.(String(e?.type ?? e)));
    }
    hostSide = 'wolf';
    send(m) {
        try {
            if (this.conn?.open)
                this.conn.send(m);
        }
        catch {
            /* 忽略 */
        }
    }
    sendMove(from, to) {
        this.send({ t: 'move', from, to });
    }
    sendCode(code) {
        this.send({ t: 'state', code, side: this.hostSide });
    }
    get connected() {
        return !!this.conn?.open;
    }
    close() {
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