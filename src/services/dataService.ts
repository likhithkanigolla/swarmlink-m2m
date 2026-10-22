// Data service: one interface, two adapters.
//  - MockAdapter (default): the scripted in-browser scenario engine.
//  - ApiAdapter: REST snapshot + WebSocket /ws/events feed for FastAPI.
// Switch via VITE_API_URL / VITE_WS_URL (see README).
import { MockEngine } from "@/mock/scenario";
import type { FeedMessage, ConnectionStatus } from "@/types/domain";

export interface DataAdapter {
  start(emit: (m: FeedMessage) => void, onStatus: (s: ConnectionStatus) => void): void;
  stop(): void;
  setSpeed(speed: number): void;
  setPaused(paused: boolean): void;
  setRoomCount(n: number): void;
  decide(incidentId: string, approve: boolean): void;
}

export class MockAdapter implements DataAdapter {
  private engine: MockEngine | null = null;
  private emit: ((m: FeedMessage) => void) | null = null;
  private onStatus: ((s: ConnectionStatus) => void) | null = null;

  start(emit: (m: FeedMessage) => void, onStatus: (s: ConnectionStatus) => void) {
    this.emit = emit;
    this.onStatus = onStatus;
    this.engine = new MockEngine(emit);
    this.engine.start();
    onStatus("mock");
  }

  stop() {
    this.engine?.stop();
    this.engine = null;
    this.onStatus?.("disconnected");
  }

  setSpeed(speed: number) {
    this.engine?.setSpeed(speed);
  }

  setPaused(paused: boolean) {
    this.engine?.setPaused(paused);
  }

  setRoomCount(n: number) {
    this.engine?.setRoomCount(n);
  }

  decide(incidentId: string, approve: boolean) {
    this.engine?.decide(incidentId, approve);
  }
}

const RECONNECT_MS = 3000;

export class ApiAdapter implements DataAdapter {
  private ws: WebSocket | null = null;
  private stopped = false;
  private emit: ((m: FeedMessage) => void) | null = null;
  private onStatus: ((s: ConnectionStatus) => void) | null = null;
  private speed = 1;
  private paused = false;
  private apiUrl = import.meta.env.VITE_API_URL ?? "";
  private wsUrl = import.meta.env.VITE_WS_URL ?? "";

  start(emit: (m: FeedMessage) => void, onStatus: (s: ConnectionStatus) => void) {
    this.emit = emit;
    this.onStatus = onStatus;
    this.stopped = false;
    void this.fetchSnapshot();
    this.connect();
  }

  private async fetchSnapshot() {
    try {
      const res = await fetch(`${this.apiUrl}/api/snapshot`);
      if (res.ok) this.emit?.({ type: "snapshot", data: await res.json() });
    } catch {
      // ws reconnect will surface connection issues
    }
  }

  private connect() {
    if (this.stopped || !this.wsUrl) {
      this.onStatus?.("disconnected");
      return;
    }
    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => this.onStatus?.("connected");
    this.ws.onmessage = (msg) => {
      try {
        this.emit?.(JSON.parse(msg.data) as FeedMessage);
      } catch {
        // ignore malformed frames
      }
    };
    this.ws.onclose = () => {
      if (!this.stopped) {
        this.onStatus?.("reconnecting");
        this.scheduleReconnect();
      }
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, RECONNECT_MS);
  }

  stop() {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
    this.onStatus?.("disconnected");
  }

  setSpeed() {
    // server-driven in live mode; kept for interface parity
  }

  setPaused() {
    // pausing is a client concern in live mode (feed buffering)
  }

  setRoomCount() {
    // server-driven in live mode
  }

  async decide(incidentId: string, approve: boolean) {
    const action = approve ? "approve" : "reject";
    try {
      await fetch(`${this.apiUrl}/api/incidents/${incidentId}/${action}`, { method: "POST" });
    } catch {
      // surfaced via connection status
    }
  }
}

export function createAdapter(): DataAdapter {
  return import.meta.env.VITE_API_URL ? new ApiAdapter() : new MockAdapter();
}
