import React, { useState } from "react";
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Layers } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";
import type { TreeNode } from "@/types/domain";

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const now = Date.now();
  const isFlashing = node.flashTs && now - node.flashTs < 2500;

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col">
      <div
        onClick={() => hasChildren && setOpen(!open)}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-colors text-xs font-mono ${
          isFlashing
            ? "bg-teal-500/20 text-teal-900 dark:text-teal-200 animate-pulse font-semibold"
            : "hover:bg-muted/60 text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}

        {hasChildren ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          )
        ) : (
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}

        <span className="truncate">{node.label}</span>
        <span className="text-[9px] text-muted-foreground uppercase rounded bg-muted/60 px-1 py-0.2 shrink-0">
          {node.kind}
        </span>
      </div>

      {open && hasChildren && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ResourceTreeExplorer() {
  const tree = useDashboard((s) => s.tree);
  const pathLabel = tree?.path ?? "//localhost:8080/cse-in";
  const cseTitle = tree?.label ? `ACME ${tree.label}` : "ACME CSEBase";

  return (
    <CardShell
      id="resource-tree"
      title="oneM2M Resource Tree"
      subtitle={cseTitle}
      defaultCollapsed={false}
      action={
        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]" title={pathLabel}>
          {pathLabel}
        </span>
      }
    >
      <div className="max-h-60 overflow-y-auto scrollbar-thin rounded-lg border border-border/60 bg-muted/10 p-2">
        {tree ? (
          <TreeItem node={tree} />
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Loading oneM2M CSE tree…
          </div>
        )}
      </div>
    </CardShell>
  );
}
