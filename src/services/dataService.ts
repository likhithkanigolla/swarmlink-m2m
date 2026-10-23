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
  private apiUrl = (import.meta.env as Record<string, string | undefined>)["VITE_API_URL"] ?? "http://localhost:8000";
  private wsUrl = (import.meta.env as Record<string, string | undefined>)["VITE_WS_URL"] ?? "ws://localhost:8000/ws/events";
  private failedAttempts = 0;
  private maxAttemptsBeforeFallback = 2;
  private fallbackToMock: (() => void) | null = null;

  constructor(fallbackToMock?: () => void) {
    this.fallbackToMock = fallbackToMock ?? null;
  }

  start(emit: (m: FeedMessage) => void, onStatus: (s: ConnectionStatus) => void) {
    this.emit = emit;
    this.onStatus = onStatus;
    this.stopped = false;
    this.failedAttempts = 0;
    void this.fetchSnapshot();
    this.connect();
  }

  private async fetchSnapshot() {
    try {
      const res = await fetch(`${this.apiUrl}/api/snapshot`);
      if (res.ok) {
        this.emit?.({ type: "snapshot", data: await res.json() });
        this.failedAttempts = 0;
      } else {
        this.handleFailure();
      }
    } catch {
      this.handleFailure();
    }
  }

  private handleFailure() {
    this.failedAttempts++;
    // If backend is unreachable (e.g. running in Lovable cloud preview where localhost:8000 does not exist),
    // smoothly fall back to mock mode so the UI stays fully interactive and never crashes.
    const isCloudEnvironment =
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1";

    const explicitApiConfigured = Boolean(
      (import.meta.env as Record<string, string | undefined>)["VITE_API_URL"]
    );

    // If on a remote host (like Lovable preview) without explicit external API URL, or after consecutive failures:
    if ((isCloudEnvironment && !explicitApiConfigured) || this.failedAttempts >= this.maxAttemptsBeforeFallback) {
      if (this.fallbackToMock) {
        console.warn(
          "[SwarmLink-M2M] Backend unreachable at " +
            this.apiUrl +
            ". Seamlessly activating resilient in-browser mode for Lovable / cloud preview."
        );
        this.stop();
        this.fallbackToMock();
      }
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
    this.ws.onopen = () => {
      this.failedAttempts = 0;
      this.onStatus?.("connected");
    };
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
        this.handleFailure();
        this.scheduleReconnect();
      }
    };
    this.ws.onerror = () => {
      this.handleFailure();
      this.ws?.close();
    };
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

  setSpeed(speed: number) {
    this.speed = speed;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
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

/**
 * Composite adapter that attempts live API connection first,
 * but gracefully falls back to MockAdapter if the backend is unavailable (e.g. deployed on Lovable).
 */
export class ResilientAdapter implements DataAdapter {
  private activeAdapter: DataAdapter;
  private emit: ((m: FeedMessage) => void) | null = null;
  private onStatus: ((s: ConnectionStatus) => void) | null = null;
  private currentSpeed = 1;
  private currentPaused = false;

  constructor() {
    const forceMock = (import.meta.env as Record<string, string | undefined>)["VITE_USE_MOCK"] === "true";
    
    // In cloud / Lovable environment without explicit VITE_API_URL, default to Mock to ensure instant wow factor
    const isCloudWithoutApi =
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1" &&
      !(import.meta.env as Record<string, string | undefined>)["VITE_API_URL"];

    if (forceMock || isCloudWithoutApi) {
      this.activeAdapter = new MockAdapter();
    } else {
      this.activeAdapter = new ApiAdapter(() => this.switchToMock());
    }
  }

  private switchToMock() {
    if (this.activeAdapter instanceof MockAdapter) return;
    this.activeAdapter.stop();
    this.activeAdapter = new MockAdapter();
    if (this.emit && this.onStatus) {
      this.activeAdapter.start(this.emit, this.onStatus);
      this.activeAdapter.setSpeed(this.currentSpeed);
      this.activeAdapter.setPaused(this.currentPaused);
    }
  }

  start(emit: (m: FeedMessage) => void, onStatus: (s: ConnectionStatus) => void) {
    this.emit = emit;
    this.onStatus = onStatus;
    this.activeAdapter.start(emit, onStatus);
  }

  stop() {
    this.activeAdapter.stop();
  }

  setSpeed(speed: number) {
    this.currentSpeed = speed;
    this.activeAdapter.setSpeed(speed);
  }

  setPaused(paused: boolean) {
    this.currentPaused = paused;
    this.activeAdapter.setPaused(paused);
  }

  setRoomCount(n: number) {
    this.activeAdapter.setRoomCount(n);
  }

  decide(incidentId: string, approve: boolean) {
    this.activeAdapter.decide(incidentId, approve);
  }
}

export function createAdapter(): DataAdapter {
  return new ResilientAdapter();
}
