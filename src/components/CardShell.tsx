import React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/store/dashboard";

interface CardShellProps {
  id: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function CardShell({
  id,
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  collapsible = true,
  defaultCollapsed = false,
}: CardShellProps) {
  const focusedCard = useDashboard((s) => s.focusedCard);
  const setFocusedCard = useDashboard((s) => s.setFocusedCard);
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const isFocused = focusedCard === id;

  // Close full-screen focus on Escape
  React.useEffect(() => {
    if (!isFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedCard(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFocused, setFocusedCard]);

  if (isFocused) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background p-6">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle && <span className="text-sm text-muted-foreground">{subtitle}</span>}
          </div>
          <div className="flex items-center gap-2">
            {action}
            <button
              onClick={() => setFocusedCard(null)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-xs hover:bg-muted"
              title="Close focus view (Esc)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>Exit focus (Esc)</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-card p-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-shadow duration-200 hover:shadow-sm flex flex-col",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
              title={collapsed ? "Expand card" : "Collapse card"}
            >
              <span className="inline-block transform transition-transform duration-150 text-[10px]">
                {collapsed ? "▶" : "▼"}
              </span>
            </button>
          )}
          <div className="min-w-0 flex items-baseline gap-2 truncate">
            <span className="text-xs font-semibold text-foreground tracking-tight whitespace-nowrap">
              {title}
            </span>
            {subtitle && (
              <span className="hidden xl:inline truncate text-[11px] text-muted-foreground font-normal">
                {subtitle}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          <button
            onClick={() => setFocusedCard(id)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Focus card"
            aria-label="Focus card"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className={cn("p-4 flex-1 flex flex-col min-h-0", bodyClassName)}>{children}</div>
      )}
    </div>
  );
}
