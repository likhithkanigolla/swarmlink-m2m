// Central dashboard store. The data adapter pushes FeedMessages in; components
// read slices. UI-only state (filters, focus, speed, theme) lives here too.
import { create } from "zustand";
import type {
  AuditStep,
  ConnectionStatus,
  FeedMessage,
  FlStatus,
  Incident,
  Kpi,
  Layer,
  LinkMetrics,
  Protocol,
  QueueEntry,
  RemediationCatalogEntry,
  RoomHealth,
  RobotState,
  SecEntry,
  Snapshot,
  StreamFilters,
  SubsystemHealth,
  TrafficEvent,
  TreeNode,
} from "@/types/domain";

export interface Focus {
  kind: "room" | "device" | "incident" | null;
  id: string | null;
}

const emptyFilters = (): StreamFilters => ({
  layers: new Set(),
  protocols: new Set(),
  rooms: new Set(),
  devices: new Set(),
  errorsOnly: false,
  search: "",
});

export interface QueueState {
  entries: QueueEntry[];
  note: string | null;
  reorderedAt: number;
}

interface DashboardState {
  connection: ConnectionStatus;
  events: TrafficEvent[];
  kpis: Kpi[];
  layerHistory: { bucketTs: number; counts: Partial<Record<Layer, number>> }[];
  rooms: RoomHealth[];
  robot: RobotState;
  queue: QueueState;
  incidents: Incident[];
  tree: TreeNode | null;
  link: LinkMetrics | null;
  audit: AuditStep[];
  security: SecEntry[];
  fl: FlStatus;
  subsystems: SubsystemHealth[];
  catalog: RemediationCatalogEntry[];
  filters: StreamFilters;
  focus: Focus;
  selectedEventId: string | null;
  selectedIncidentId: string | null;
  focusedCard: string | null;
  drawerEvent: TrafficEvent | null;
  speed: number;
  paused: boolean;
  dark: boolean;

  applyMessage: (m: FeedMessage) => void;
  setConnection: (s: ConnectionStatus) => void;
  toggleFilter: (kind: "layers" | "protocols" | "rooms" | "devices", value: string) => void;
  setErrorsOnly: (v: boolean) => void;
  setSearch: (v: string) => void;
  clearFilters: () => void;
  setFocus: (f: Focus) => void;
  selectEvent: (id: string | null) => void;
  openDrawer: (e: TrafficEvent | null) => void;
  selectIncident: (id: string | null) => void;
  setFocusedCard: (id: string | null) => void;
  setSpeed: (s: number) => void;
  setPaused: (p: boolean) => void;
  toggleDark: () => void;
}

const MAX_EVENTS = 1200;

export const useDashboard = create<DashboardState>((set) => ({
  connection: "disconnected",
  events: [],
  kpis: [],
  layerHistory: [],
  rooms: [],
  robot: {
    battery: 0, memPct: 0, posRoomId: "r1", targetRoomId: null,
    progress: 1, route: [], detour: null, etaMs: 0, busy: false,
  },
  queue: { entries: [], note: null, reorderedAt: 0 },
  incidents: [],
  tree: null,
  link: null,
  audit: [],
  security: [],
  fl: { round: 0, modelVersion: "-", status: "idle" },
  subsystems: [],
  catalog: [],
  filters: emptyFilters(),
  focus: { kind: null, id: null },
  selectedEventId: null,
  selectedIncidentId: null,
  focusedCard: null,
  drawerEvent: null,
  speed: 1,
  paused: false,
  dark: false,

  applyMessage: (m) =>
    set((st) => {
      switch (m.type) {
        case "subsystems":
          return { subsystems: m.data as SubsystemHealth[] };
        case "event": {
          const e = m.data as TrafficEvent;
          return { events: [e, ...st.events].slice(0, MAX_EVENTS) };
        }
        case "metric":
          return { kpis: (m.data as { kpis: Kpi[] }).kpis };
        case "room":
          return { rooms: m.data as RoomHealth[] };
        case "robot":
          return { robot: m.data as RobotState };
        case "queue": {
          const q = m.data as { entries: QueueEntry[]; note?: string };
          return {
            queue: {
              entries: q.entries,
              note: q.note ?? st.queue.note,
              reorderedAt: q.note ? Date.now() : st.queue.reorderedAt,
            },
          };
        }
        case "incident": {
          const incidents = m.data as Incident[];
          const keepSelected =
            st.selectedIncidentId && incidents.some((i) => i.id === st.selectedIncidentId);
          return {
            incidents,
            selectedIncidentId: keepSelected
              ? st.selectedIncidentId
              : (incidents.find((i) => i.status === "pending_approval")?.id ??
                st.selectedIncidentId),
          };
        }
        case "audit":
          return { audit: m.data as AuditStep[] };
        case "tree":
          return { tree: m.data as TreeNode };
        case "link":
          return { link: m.data as LinkMetrics };
        case "security":
          return { security: m.data as SecEntry[] };
        case "fl":
          return { fl: m.data as FlStatus };
        case "snapshot": {
          const s = m.data as Snapshot;
          return {
            subsystems: s.subsystems ?? st.subsystems,
            rooms: s.rooms,
            robot: s.robot,
            queue: { entries: s.queue, note: null, reorderedAt: 0 },
            incidents: s.incidents,
            tree: s.tree,
            link: s.link,
            kpis: s.kpis,
            audit: s.audit,
            security: s.security,
            fl: s.fl,
            catalog: s.catalog,
            layerHistory: s.layerHistory,
          };
        }
        default:
          return {};
      }
    }),

  setConnection: (connection) => set({ connection }),

  toggleFilter: (kind, value) =>
    set((st) => {
      const next = new Set(st.filters[kind] as Set<string>);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { filters: { ...st.filters, [kind]: next } };
    }),

  setErrorsOnly: (errorsOnly) => set((st) => ({ filters: { ...st.filters, errorsOnly } })),
  setSearch: (search) => set((st) => ({ filters: { ...st.filters, search } })),
  clearFilters: () => set({ filters: emptyFilters() }),
  setFocus: (focus) =>
    set((st) => {
      const filters = { ...st.filters };
      if (focus.kind === "room") filters.rooms = new Set([focus.id!]);
      else if (focus.kind === "device") filters.devices = new Set([focus.id!]);
      else filters.rooms = new Set();
      return { focus, filters };
    }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  openDrawer: (drawerEvent) => set({ drawerEvent }),
  selectIncident: (selectedIncidentId) => set({ selectedIncidentId }),
  setFocusedCard: (focusedCard) => set({ focusedCard }),
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  toggleDark: () =>
    set((st) => {
      const dark = !st.dark;
      document.documentElement.classList.toggle("dark", dark);
      return { dark };
    }),
}));

export function filterEvents(
  events: TrafficEvent[],
  filters: StreamFilters,
  focus: Focus,
): TrafficEvent[] {
  const q = filters.search.trim().toLowerCase();
  return events.filter((e) => {
    if (filters.layers.size && !filters.layers.has(e.layer)) return false;
    if (filters.protocols.size && !filters.protocols.has(e.protocol)) return false;
    if (filters.rooms.size && (!e.roomId || !filters.rooms.has(e.roomId))) return false;
    if (filters.devices.size && (!e.deviceId || !filters.devices.has(e.deviceId))) return false;
    if (filters.errorsOnly && e.status < 4000) return false;
    if (focus.kind === "incident" && focus.id && e.incidentId !== focus.id) return false;
    if (focus.kind === "room" && focus.id && e.roomId !== focus.id) return false;
    if (focus.kind === "device" && focus.id && e.deviceId !== focus.id) return false;
    if (q) {
      const hay = `${e.src} ${e.dst} ${e.path} ${e.op} ${e.protocol} ${e.layer}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
