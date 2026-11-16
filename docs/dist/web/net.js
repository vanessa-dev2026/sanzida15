async function post(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json());
    if (!res.ok)
        throw new Error(data.error ?? `请求失败（${res.status}）`);
    return data;
}
export function createRoom(side) {
    return post('/api/rooms', { side });
}
export function joinRoom(roomId) {
    return post(`/api/rooms/${roomId.toUpperCase()}/join`);
}
export function sendMove(roomId, side, token, from, to) {
    return post(`/api/rooms/${roomId}/move`, { side, token, from, to });
}
export function subscribe(roomId, onState, onError) {
    const es = new EventSource(`/api/rooms/${roomId}/stream`);
    es.addEventListener('state', (ev) => {
        try {
            onState(JSON.parse(ev.data));
        }
        catch {
            /* 忽略坏消息 */
        }
    });
    es.onerror = () => onError?.();
    return es;
}
//# sourceMappingURL=net.js.map