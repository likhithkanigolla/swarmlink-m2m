import React, { useState, useMemo } from "react";
import {
  Download,
  Filter,
  Search,
  ArrowRight,
  AlertCircle,
  Clock,
  Layers,
  ChevronRight,
} from "lucide-react";
import { useDashboard, filterEvents } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";
import { TrafficAreaChart } from "@/components/TrafficAreaChart";
import { downloadCsv } from "@/lib/csv";
import { LAYERS, PROTOCOLS, layerLabel, statusTone } from "@/lib/layers";
import type { TrafficEvent, Layer, Protocol } from "@/types/domain";

const LAYER_BADGE_CLASSES: Record<Layer, string> = {
  radio: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  core: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  mec: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  mca: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  mcc: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  device: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  robot: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  triage: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
  mcp: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  llm: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20",
  dash: "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 border-neutral-500/20",
};

export function LiveTrafficStream() {
  const events = useDashboard((s) => s.events);
  const filters = useDashboard((s) => s.filters);
  const focus = useDashboard((s) => s.focus);
  const toggleFilter = useDashboard((s) => s.toggleFilter);
  const setErrorsOnly = useDashboard((s) => s.setErrorsOnly);
  const setSearch = useDashboard((s) => s.setSearch);
  const clearFilters = useDashboard((s) => s.clearFilters);
  const openDrawer = useDashboard((s) => s.openDrawer);
  const selectedEventId = useDashboard((s) => s.selectedEventId);
  const selectEvent = useDashboard((s) => s.selectEvent);

  const [isHoverPaused, setIsHoverPaused] = useState(false);

  // Filtered stream
  const filtered = useMemo(() => {
    return filterEvents(events, filters, focus);
  }, [events, filters, focus]);

  const handleRowClick = (e: TrafficEvent) => {
    selectEvent(e.id);
    openDrawer(e);
  };

  const hasActiveFilters =
    filters.layers.size > 0 ||
    filters.protocols.size > 0 ||
    filters.rooms.size > 0 ||
    filters.devices.size > 0 ||
    filters.errorsOnly ||
    filters.search !== "";

  return (
    <CardShell
      id="traffic-stream"
      title="Unified Live Traffic Stream"
      subtitle={`${filtered.length} frames · ${events.length} total`}
      className="h-full flex-1"
      bodyClassName="p-0 flex flex-col"
      action={
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Reset filters
            </button>
          )}
          <button
            onClick={() => downloadCsv(filtered)}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            title="Export filtered events as CSV"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      }
    >
      {/* 60s Layer Area Chart */}
      <TrafficAreaChart />

      {/* Filter toolbar */}
      <div className="flex flex-col gap-2 border-b border-border/80 bg-muted/20 p-2.5">
        {/* Search & errors toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search source, destination, path, op, protocol…"
              value={filters.search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            onClick={() => setErrorsOnly(!filters.errorsOnly)}
            className={`flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              filters.errorsOnly
                ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Errors Only</span>
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
          <span className="text-muted-foreground font-mono shrink-0 mr-1">Layer:</span>
          {LAYERS.map((l) => {
            const active = filters.layers.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleFilter("layers", l.id)}
                className={`shrink-0 rounded-md border px-2 py-0.5 font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </button>
            );
          })}

          <div className="h-3 w-px bg-border shrink-0 mx-1" />

          <span className="text-muted-foreground font-mono shrink-0 mr-1">Protocol:</span>
          {PROTOCOLS.map((p) => {
            const active = filters.protocols.has(p);
            return (
              <button
                key={p}
                onClick={() => toggleFilter("protocols", p)}
                className={`shrink-0 rounded-md border px-2 py-0.5 font-mono font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground font-semibold"
                    : "border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stream Table */}
      <div
        className="flex-1 overflow-y-auto min-h-[500px] max-h-[680px] scrollbar-thin"
        onMouseEnter={() => setIsHoverPaused(true)}
        onMouseLeave={() => setIsHoverPaused(false)}
      >
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-[11px] font-semibold text-muted-foreground uppercase tracking-wider backdrop-blur-xs">
            <tr>
              <th className="py-2 pl-3 pr-2 w-20">Time</th>
              <th className="py-2 px-2 w-28">Layer</th>
              <th className="py-2 px-2 w-16">Proto</th>
              <th className="py-2 px-2 w-44">Flow (Src &rarr; Dst)</th>
              <th className="py-2 px-2 w-16">Op</th>
              <th className="py-2 px-2">Resource Path</th>
              <th className="py-2 px-2 w-20">Status</th>
              <th className="py-2 px-2 w-14 text-right">Lat</th>
              <th className="py-2 pr-3 pl-2 w-16 text-right">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                  No matching traffic frames. Adjust filters or resume feed.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 100).map((e) => {
                const tone = statusTone(e.status);
                const isSelected = selectedEventId === e.id;
                const timeOnly = new Date(e.ts).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  fractionalSecondDigits: 3,
                  hour12: false,
                });

                return (
                  <tr
                    key={e.id}
                    onClick={() => handleRowClick(e)}
                    className={`cursor-pointer transition-colors hover:bg-muted/60 ${
                      isSelected ? "bg-primary/10" : ""
                    } ${tone === "crit" ? "bg-rose-500/5" : ""}`}
                  >
                    {/* Time */}
                    <td className="py-2 pl-3 pr-2 text-[10px] text-muted-foreground whitespace-nowrap">
                      {timeOnly}
                    </td>

                    {/* Layer */}
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium font-sans ${
                          LAYER_BADGE_CLASSES[e.layer]
                        }`}
                      >
                        {layerLabel(e.layer)}
                      </span>
                    </td>

                    {/* Protocol */}
                    <td className="py-2 px-2 text-[10px] text-muted-foreground whitespace-nowrap">
                      {e.protocol}
                    </td>

                    {/* Source -> Destination */}
                    <td className="py-2 px-2 text-[11px] whitespace-nowrap">
                      <span className="font-semibold text-foreground">{e.src}</span>
                      <span className="text-muted-foreground mx-1">&rarr;</span>
                      <span className="text-muted-foreground">{e.dst}</span>
                    </td>

                    {/* Operation */}
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span
                        className={`font-semibold text-[10px] ${
                          e.op === "PING"
                            ? "text-sky-600 dark:text-sky-400"
                            : e.op === "CREATE"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : e.op === "UPDATE"
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-foreground"
                        }`}
                      >
                        {e.op}
                      </span>
                    </td>

                    {/* Resource Path */}
                    <td className="py-2 px-2 truncate max-w-xs text-[11px] text-muted-foreground">
                      {e.path}
                    </td>

                    {/* Status Code */}
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-bold ${
                          tone === "crit"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            : tone === "warn"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>

                    {/* Latency */}
                    <td className="py-2 px-2 text-right text-[10px] text-muted-foreground whitespace-nowrap">
                      {e.latencyMs}ms
                    </td>

                    {/* Bytes */}
                    <td className="py-2 pr-3 pl-2 text-right text-[10px] text-muted-foreground whitespace-nowrap">
                      {e.bytes > 1024 ? `${(e.bytes / 1024).toFixed(1)}k` : `${e.bytes}B`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}
