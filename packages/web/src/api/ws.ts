import type { WsServerMessage } from "@rekha/shared";

type Handler = (msg: WsServerMessage) => void;

/**
 * Single multiplexed WebSocket to the server, with auto-reconnect + backoff and
 * re-subscription of active topics after a reconnect.
 */
class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private subscriptions = new Map<string, unknown>();
  private backoff = 1000;
  private connected = false;

  connect(): void {
    if (this.ws) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.backoff = 1000;
      for (const [topic, filters] of this.subscriptions) {
        this.rawSend({ op: "subscribe", topic, filters });
      }
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsServerMessage;
        this.handlers.forEach((h) => h(msg));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 15000);
    };
    ws.onerror = () => ws.close();
  }

  subscribe(topic: string, filters?: unknown): void {
    this.subscriptions.set(topic, filters);
    if (this.connected) this.rawSend({ op: "subscribe", topic, filters });
  }

  unsubscribe(topic: string): void {
    this.subscriptions.delete(topic);
    if (this.connected) this.rawSend({ op: "unsubscribe", topic });
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private rawSend(obj: unknown): void {
    this.ws?.send(JSON.stringify(obj));
  }
}

export const wsClient = new WsClient();
