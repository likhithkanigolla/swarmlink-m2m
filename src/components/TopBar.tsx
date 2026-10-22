import React, { useEffect, useState } from "react";
import {
  Activity,
  Play,
  Pause,
  Sun,
  Moon,
  Radio,
  Server,
  Cpu,
  Brain,
  Wifi,
  Layers,
  Layers2,
  Sliders,
} from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import type { SubsystemHealth } from "@/types/domain";

export function TopBar() {
  const connection = useDashboard((s) => s.connection);
  const paused = useDashboard((s) => s.paused);
  const setPaused = useDashboard((s) => s.setPaused);
  const dark = useDashboard((s) => s.dark);
  const toggleDark = useDashboard((s) => s.toggleDark);
  const link = useDashboard((s) => s.link);
  const subsystems = useDashboard((s) => s.subsystems);

  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Icon mapping for backend subsystem types
  const getSubsystemIcon = (type?: string, id?: string) => {
    if (type === "brain" || id === "edge-llm") return Brain;
    if (type === "radio" || id === "5g-core") return Radio;
    if (type === "wifi" || id === "radio") return Wifi;
    return Server;
  };

  // Subsystems from backend JSON snapshot / stream
  const activeDistrict = link?.district ?? "A";
  const displayChips: SubsystemHealth[] =
    subsystems.length > 0
      ? subsystems
      : [
          { id: "in-cse", label: "IN-CSE", status: "online", type: "server", endpoint: "//acme.example.com/CSEBase" },
          { id: "mn-a", label: "MN-CSE A", status: activeDistrict === "A" ? "online" : "standby", type: "server", endpoint: "//acme.example.com/CSEBase/DistrictA-MN-CSE" },
          { id: "mn-b", label: "MN-CSE B", status: activeDistrict === "B" ? "online" : "standby", type: "server", endpoint: "//acme.example.com/CSEBase/DistrictB-MN-CSE" },
          { id: "5g-core", label: "5G Core", status: link?.state === "re_registering" ? "warn" : "online", type: "radio", endpoint: "core.5g.local" },
          { id: "radio", label: "Radio", status: (link?.rsrp ?? -80) < -100 ? "warn" : "online", type: "wifi", endpoint: "gNB-DistrictA" },
          { id: "edge-llm", label: "Edge LLM", status: "online", type: "brain", endpoint: "llm-mcp.edge.local" },
        ];

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 sm:px-6 backdrop-blur-md">
      {/* Brand & title */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              SwarmLink-M2M Command Center
            </h1>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5 rounded">
              v1.0 private-5G
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Robot Middleware &middot; oneM2M ACME &middot; ESP32 Swarm Telemetry
          </p>
        </div>
      </div>

      {/* Backend-driven subsystem health chips */}
      <div className="hidden lg:flex items-center gap-1.5">
        {displayChips.map((c) => {
          const Icon = getSubsystemIcon(c.type, c.id);
          const dotColor =
            c.status === "online"
              ? "bg-emerald-500"
              : c.status === "warn"
              ? "bg-amber-500 animate-pulse"
              : c.status === "standby"
              ? "bg-blue-400"
              : "bg-rose-500";

          return (
            <div
              key={c.id}
              className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-foreground font-medium"
              title={c.endpoint ? `${c.label} · ${c.endpoint}` : c.label}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span>{c.label}</span>
            </div>
          );
        })}
      </div>

      {/* Controls & Clock */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Play/Pause */}
        <button
          onClick={() => setPaused(!paused)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
            paused
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-border bg-card text-foreground hover:bg-muted"
          }`}
          title={paused ? "Resume real-time engine" : "Pause real-time stream"}
        >
          {paused ? (
            <>
              <Play className="h-3 w-3 fill-current" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="h-3 w-3 fill-current" />
              <span>Live</span>
            </>
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleDark}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={dark ? "Switch to light theme" : "Switch to dark theme"}
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Clock */}
        <div className="hidden font-mono text-xs text-muted-foreground sm:block bg-muted/40 px-2 py-1 rounded-md border border-border/60">
          {timeStr}
        </div>
      </div>
    </header>
  );
}
