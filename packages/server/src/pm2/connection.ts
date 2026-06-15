import pm2 from "pm2";
import type { Logger } from "pino";

/**
 * Owns the single connection to the local PM2 god daemon. Connects lazily,
 * reconnects with backoff, and exposes the raw pm2 module to callers that have
 * ensured connectivity.
 */
export class Pm2Connection {
  private connected = false;
  private connecting: Promise<void> | null = null;

  constructor(private readonly log: Logger) {}

  async ensure(): Promise<typeof pm2> {
    if (this.connected) return pm2;
    if (!this.connecting) {
      this.connecting = new Promise<void>((resolve, reject) => {
        pm2.connect((err) => {
          this.connecting = null;
          if (err) {
            this.connected = false;
            reject(err);
            return;
          }
          this.connected = true;
          resolve();
        });
      });
    }
    await this.connecting;
    return pm2;
  }

  markDisconnected(): void {
    this.connected = false;
  }

  disconnect(): void {
    if (this.connected) {
      pm2.disconnect();
      this.connected = false;
    }
  }
}
