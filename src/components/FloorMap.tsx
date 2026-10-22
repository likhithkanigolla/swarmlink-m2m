import React from "react";
import { Bot, Radio, Server, CheckCircle2, AlertTriangle, AlertOctagon, HelpCircle } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";
import type { RoomHealth, DeviceState } from "@/types/domain";

export function FloorMap() {
  const rooms = useDashboard((s) => s.rooms);
  const robot = useDashboard((s) => s.robot);
  const focus = useDashboard((s) => s.focus);
  const setFocus = useDashboard((s) => s.setFocus);
  const link = useDashboard((s) => s.link);

  const activeDistrict = link?.district ?? "A";

  const handleRoomClick = (roomId: string) => {
    if (focus.kind === "room" && focus.id === roomId) {
      setFocus({ kind: null, id: null });
    } else {
      setFocus({ kind: "room", id: roomId });
    }
  };

  const handleDeviceClick = (e: React.MouseEvent, deviceId: string) => {
    e.stopPropagation();
    if (focus.kind === "device" && focus.id === deviceId) {
      setFocus({ kind: null, id: null });
    } else {
      setFocus({ kind: "device", id: deviceId });
    }
  };

  return (
    <CardShell
      id="floor-map"
      title="Facility Floor Map"
      subtitle={`${rooms.length} rooms · District A & B`}
      action={
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Alive
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Drift
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> NaN
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Network & Edge Hosts Bar */}
        <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 p-2 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Radio
                className={`h-3.5 w-3.5 ${
                  link?.state === "re_registering" ? "text-amber-500 animate-pulse" : "text-sky-500"
                }`}
              />
              <span className="font-medium text-foreground">gNodeB 5G Radio</span>
              <span className="rounded bg-sky-500/10 px-1 py-0.2 text-[10px] font-mono text-sky-600 dark:text-sky-400">
                District {activeDistrict}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Server className="h-3.5 w-3.5 text-indigo-500" />
              <span>MEC Edge Host</span>
            </div>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="MEC-IPE Active" />
          </div>
        </div>

        {/* Rooms Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {rooms.map((room) => {
            const isSelected = focus.kind === "room" && focus.id === room.id;
            const hasRobot = robot.posRoomId === room.id && robot.progress >= 0.9;
            const isTarget = robot.targetRoomId === room.id;
            const isDetour = robot.detour === room.id;

            const borderHealth =
              room.health === "critical"
                ? "border-rose-400/80 bg-rose-50/20 dark:bg-rose-950/20"
                : room.health === "warning"
                ? "border-amber-400/80 bg-amber-50/20 dark:bg-amber-950/20"
                : "border-border/80 hover:border-border";

            return (
              <div
                key={room.id}
                onClick={() => handleRoomClick(room.id)}
                className={`group relative flex flex-col justify-between rounded-xl border p-3 cursor-pointer transition-all ${borderHealth} ${
                  isSelected ? "ring-2 ring-primary shadow-sm" : ""
                }`}
              >
                {/* Room header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground tracking-tight">
                      {room.name}
                    </span>
                    <span className="rounded bg-muted px-1 py-0.2 text-[9px] font-mono text-muted-foreground">
                      Dist {room.district}
                    </span>
                  </div>

                  {/* Robot badge if inside room */}
                  {hasRobot && (
                    <div className="flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-600 dark:text-teal-400 border border-teal-500/30 animate-pulse">
                      <Bot className="h-3 w-3" />
                      <span>Doctor Inside</span>
                    </div>
                  )}

                  {!hasRobot && isTarget && (
                    <span className="text-[10px] text-primary font-medium animate-pulse">
                      Inbound…
                    </span>
                  )}
                </div>

                {/* Device dots */}
                <div className="flex items-center justify-between gap-1 rounded-lg bg-background/70 p-2 border border-border/40">
                  <div className="flex items-center gap-1.5">
                    {room.devices.map((d) => {
                      const isDevSelected = focus.kind === "device" && focus.id === d.id;
                      const dotColor =
                        d.fault === "nan"
                          ? "bg-rose-500 ring-rose-200 dark:ring-rose-900 animate-pulse"
                          : d.fault === "outlier"
                          ? "bg-amber-500 ring-amber-200 dark:ring-amber-900"
                          : "bg-emerald-500 ring-emerald-100 dark:ring-emerald-950";

                      return (
                        <button
                          key={d.id}
                          onClick={(e) => handleDeviceClick(e, d.id)}
                          className={`group/dot relative flex h-5 w-5 items-center justify-center rounded-full ring-2 transition-transform hover:scale-110 ${dotColor} ${
                            isDevSelected ? "scale-125 ring-offset-2 ring-primary" : ""
                          }`}
                          title={`${d.id} (${d.kind}) - ${d.fault ? `Fault: ${d.fault}` : "Healthy"}`}
                        >
                          <span className="text-[8px] font-bold text-white uppercase">
                            {d.id.split("-d")[1]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {room.devices.filter((d) => !d.fault).length}/{room.devices.length}
                  </span>
                </div>

                {/* Planned route or detour indicator */}
                {isTarget && (
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-mono border-t border-border/40 pt-1.5">
                    <span className="flex items-center gap-1 text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {isDetour ? "Detour waypoint" : "Planned destination"}
                    </span>
                    <span>{Math.round(robot.progress * 100)}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Robot Route & Detour Status Banner */}
        <div className="flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-50/30 p-2 text-xs text-foreground dark:bg-teal-950/20">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <div>
              <span className="font-semibold">Robot Doctor Route: </span>
              <span className="font-mono text-muted-foreground">
                [{robot.posRoomId.toUpperCase()}]
                {robot.targetRoomId && (
                  <>
                    {" "}
                    &rarr; <span className="text-primary font-semibold">[{robot.targetRoomId.toUpperCase()}]</span>
                  </>
                )}
                {robot.route.length > 0 && (
                  <span className="text-muted-foreground"> &rarr; {robot.route.map((r) => r.toUpperCase()).join(" &rarr; ")}</span>
                )}
              </span>
            </div>
          </div>
          {robot.detour && (
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              ⚡ Ghost Detour: {robot.detour.toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </CardShell>
  );
}
