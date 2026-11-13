export type SideName = 'wolf' | 'sheep';

export interface RoomInfo {
  roomId: string;
  side: SideName;
  token: string;
}

export interface Snapshot {
  id: string;
  moves: Array<{ from: number; to: number }>;
  turn: SideName;
  result: 'wolf' | 'sheep' | 'draw' | null;
  sheepLeft: number;
  players: { wolf: boolean; sheep: boolean };
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`);
  return data;
}

export function createRoom(side: SideName): Promise<RoomInfo> {
  return post<RoomInfo>('/api/rooms', { side });
}

export function joinRoom(roomId: string): Promise<RoomInfo> {
  return post<RoomInfo>(`/api/rooms/${roomId.toUpperCase()}/join`);
}

export function sendMove(
  roomId: string,
  side: SideName,
  token: string,
  from: number,
  to: number,
): Promise<{ ok: boolean; result: string | null; error?: string }> {
  return post(`/api/rooms/${roomId}/move`, { side, token, from, to });
}

export function subscribe(roomId: string, onState: (s: Snapshot) => void, onError?: () => void): EventSource {
  const es = new EventSource(`/api/rooms/${roomId}/stream`);
  es.addEventListener('state', (ev) => {
    try {
      onState(JSON.parse((ev as MessageEvent).data) as Snapshot);
    } catch {
      /* 忽略坏消息 */
    }
  });
  es.onerror = () => onError?.();
  return es;
}
