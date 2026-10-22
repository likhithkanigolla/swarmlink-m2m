import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDataStream } from "@/hooks/useDataStream";
import { TopBar } from "@/components/TopBar";
import { KpiStrip } from "@/components/KpiStrip";
import { FloorMap } from "@/components/FloorMap";
import { VirtualQueue } from "@/components/VirtualQueue";
import { LiveTrafficStream } from "@/components/LiveTrafficStream";
import { RemediationTimeline } from "@/components/RemediationTimeline";
import { ApprovalPanel } from "@/components/ApprovalPanel";
import { AiAuditStream } from "@/components/AiAuditStream";
import { ResourceTreeExplorer } from "@/components/ResourceTreeExplorer";
import { RemediationCatalogue } from "@/components/RemediationCatalogue";
import { LinkHandoverMonitor } from "@/components/LinkHandoverMonitor";
import { SecurityTray } from "@/components/SecurityTray";
import { EventDrawer } from "@/components/EventDrawer";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [roomCount, setRoomCountState] = useState(4);
  const { setRoomCount, decide } = useDataStream();

  const handleRoomCountChange = (n: number) => {
    setRoomCountState(n);
    setRoomCount(n);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* 1. Top bar with health chips, clock, speed, and theme controls */}
      <TopBar
        currentRoomCount={roomCount}
        onRoomCountChange={handleRoomCountChange}
      />

      {/* 2. KPI Strip with small sparklines */}
      <KpiStrip />

      {/* Main 3-column Layout (Desktop-first: ~30% Left, ~45% Centre, ~25% Right) */}
      <main className="flex-1 p-3 sm:p-4 lg:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column (3.5 cols / ~30%): Floor Map + Virtual Queue + Verification List */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4">
            <FloorMap />
            <VirtualQueue />
          </div>

          {/* Centre Hero (5.5 cols / ~45%): Unified Live Traffic Stream */}
          <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-4">
            <LiveTrafficStream />
          </div>

          {/* Right Column (3 cols / ~25%): Remediation timeline, Approval panel, AI audit, Resource tree, Catalogue, Link monitor */}
          <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-4">
            {/* Operator Approval Panel (appears when PENDING_APPROVAL) */}
            <ApprovalPanel onDecide={decide} />

            {/* Remediation Timeline Signature Visual */}
            <RemediationTimeline />

            {/* AI Audit Stream */}
            <AiAuditStream />

            {/* oneM2M Resource Tree */}
            <ResourceTreeExplorer />

            {/* Remediation Catalogue */}
            <RemediationCatalogue />

            {/* 5G Radio Link & Handover Monitor */}
            <LinkHandoverMonitor />
          </div>
        </div>
      </main>

      {/* 6. Bottom Tray: oneM2M ACP Security & Federated Learning */}
      <SecurityTray />

      {/* Slide-in Event Inspection Drawer */}
      <EventDrawer />
    </div>
  );
}
