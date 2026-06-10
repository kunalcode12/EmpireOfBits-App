import { RESOLVED_API_BASE_URL } from '../api/authApi';
import { getAuthCookie } from '../utils/storageHelper';

export type ArenaSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface ArenaSocketEnvelope<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

type MessageHandler = (message: ArenaSocketEnvelope) => void;
type StatusHandler = (status: ArenaSocketStatus) => void;

type WebSocketWithHeaders = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

const wsBaseUrl = () => RESOLVED_API_BASE_URL.replace(/^http/i, 'ws');

class ArenaSocketClient {
  private socket: WebSocket | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;
  private shouldReconnect = false;

  status: ArenaSocketStatus = 'idle';

  async connect(): Promise<void> {
    this.shouldReconnect = true;

    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    // Clean up any existing dead socket before creating a new one
    if (this.socket) {
      const old = this.socket;
      this.socket = null;
      old.onopen = null;
      old.onclose = null;
      old.onerror = null;
      old.onmessage = null;
      try { old.close(); } catch {}
    }

    this.setStatus('connecting');
    const cookie = await getAuthCookie();
    const NativeWebSocket = WebSocket as unknown as WebSocketWithHeaders;
    const newSocket = new NativeWebSocket(
      `${wsBaseUrl()}/arena`,
      undefined,
      cookie ? { headers: { Cookie: cookie } } : undefined,
    );
    this.socket = newSocket;

    const pending = new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve(undefined);
      };
      const onError = () => {
        cleanup();
        reject(new Error('Arena socket connection failed'));
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Arena socket closed before opening'));
      };
      const cleanup = () => {
        newSocket.removeEventListener('open', onOpen);
        newSocket.removeEventListener('error', onError);
        newSocket.removeEventListener('close', onClose);
      };
      newSocket.addEventListener('open', onOpen);
      newSocket.addEventListener('error', onError);
      newSocket.addEventListener('close', onClose);
    }).finally(() => {
      this.connectPromise = null;
    });
    this.connectPromise = pending;

    newSocket.onopen = () => this.setStatus('open');
    newSocket.onclose = () => {
      this.setStatus('closed');
      if (this.shouldReconnect) this.scheduleReconnect();
    };
    newSocket.onerror = () => this.setStatus('error');
    newSocket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as ArenaSocketEnvelope;
        this.messageHandlers.forEach((handler) => handler(parsed));
      } catch {
        this.messageHandlers.forEach((handler) =>
          handler({ type: 'client_parse_error', payload: { message: 'Unable to read arena server message' } }),
        );
      }
    };
    return pending;
  }

  send<TPayload extends object>(type: string, payload: TPayload): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type, payload }));
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const s = this.socket;
    this.socket = null;
    this.connectPromise = null;
    if (s) {
      s.onopen = null;
      s.onclose = null;
      s.onerror = null;
      s.onmessage = null;
      try { s.close(); } catch {}
    }
    this.setStatus('idle');
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {});
    }, 1500);
  }

  private setStatus(status: ArenaSocketStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }
}

const arenaSocketClient = new ArenaSocketClient();

export const connectArenaSocket = () => arenaSocketClient.connect();
export const disconnectArenaSocket = () => arenaSocketClient.disconnect();
export const onArenaSocketMessage = (handler: MessageHandler) => arenaSocketClient.onMessage(handler);
export const onArenaSocketStatus = (handler: StatusHandler) => arenaSocketClient.onStatus(handler);

export const sendArenaMessage = <T extends object>(type: string, payload: T) =>
  arenaSocketClient.send(type, payload);

export interface ArenaLoadout {
  equippedGun: string | null;
  items: Record<string, number>;
  /** All guns the player owns — lets the server allow live in-match switching. */
  ownedGuns?: string[];
}

export const arenaJoinQueue = (loadout?: ArenaLoadout) =>
  arenaSocketClient.send('arena_join_queue', loadout ?? { equippedGun: null, items: {}, ownedGuns: [] });
export const arenaCancelQueue = () => arenaSocketClient.send('arena_cancel_queue', {});
export const arenaInput = (dx: number, dy: number, shoot: boolean, aimX = 0, aimY = 0) =>
  arenaSocketClient.send('arena_input', { dx, dy, shoot, aimX, aimY });
export const arenaLeave = () => arenaSocketClient.send('arena_leave', {});
export const arenaUseItem = (itemId: string) => arenaSocketClient.send('arena_use_item', { itemId });
export const arenaThrowBomb = (itemId: string, dirX: number, dirY: number, power: number) =>
  arenaSocketClient.send('arena_throw_bomb', { itemId, dirX, dirY, power });
export const arenaSwitchGun = (gunId: string) =>
  arenaSocketClient.send('arena_switch_gun', { gunId });
export const arenaItemDrop = (itemName: string, targetActorName: string) =>
  arenaSocketClient.send('arena_item_drop', { itemName, targetActorName });
