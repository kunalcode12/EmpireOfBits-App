import { RESOLVED_API_BASE_URL } from '../api/authApi';
import { getAuthCookie } from '../utils/storageHelper';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface SocketEnvelope<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

type MessageHandler = (message: SocketEnvelope) => void;
type StatusHandler = (status: SocketStatus) => void;

type WebSocketWithHeaders = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

const wsBaseUrl = () => RESOLVED_API_BASE_URL.replace(/^http/i, 'ws');

class SocketClient {
  private socket: WebSocket | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;
  private shouldReconnect = true;

  status: SocketStatus = 'idle';

  async connect(path = '/room'): Promise<void> {
    this.shouldReconnect = true;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      this.connectPromise = new Promise((resolve, reject) => {
        const socket = this.socket;
        if (!socket) {
          reject(new Error('Socket is unavailable during connect'));
          return;
        }
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('Socket connection failed')), { once: true });
        socket.addEventListener('close', () => reject(new Error('Socket closed before opening')), { once: true });
      }).finally(() => {
        this.connectPromise = null;
      });
      return this.connectPromise;
    }

    this.setStatus('connecting');
    const cookie = await getAuthCookie();
    const NativeWebSocket = WebSocket as unknown as WebSocketWithHeaders;
    this.socket = new NativeWebSocket(`${wsBaseUrl()}${path}`, undefined, cookie ? { headers: { Cookie: cookie } } : undefined);
    this.connectPromise = new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket is not initialized'));
        return;
      }
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Socket connection failed')), { once: true });
      this.socket.addEventListener('close', () => reject(new Error('Socket closed before opening')), { once: true });
    }).finally(() => {
      this.connectPromise = null;
    });

    this.socket.onopen = () => this.setStatus('open');
    this.socket.onclose = () => {
      this.setStatus('closed');
      if (this.shouldReconnect) this.scheduleReconnect(path);
    };
    this.socket.onerror = () => this.setStatus('error');
    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as SocketEnvelope;
        this.messageHandlers.forEach((handler) => handler(parsed));
      } catch {
        this.messageHandlers.forEach((handler) =>
          handler({ type: 'client_parse_error', payload: { message: 'Unable to read server message' } }),
        );
      }
    };
    return this.connectPromise;
  }

  send<TPayload extends object>(type: string, payload: TPayload): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Socket is not connected');
    }
    this.socket.send(JSON.stringify({ type, payload }));
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
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

  private scheduleReconnect(path: string): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(path);
    }, 1500);
  }

  private setStatus(status: SocketStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }
}

export const socketClient = new SocketClient();
