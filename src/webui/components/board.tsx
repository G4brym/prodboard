/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import type { Issue } from "../../types.ts";
import { StatusBadge } from "./status-badge.tsx";

export const Board: FC<{ issues: Issue[]; statuses: string[] }> = ({ issues, statuses }) => {
  const grouped: Record<string, Issue[]> = {};
  for (const s of statuses) {
    grouped[s] = [];
  }
  for (const issue of issues) {
    if (!grouped[issue.status]) grouped[issue.status] = [];
    grouped[issue.status].push(issue);
  }

  return (
    <div id="board" data-statuses={JSON.stringify(statuses.filter((s) => s !== "archived"))} class="flex gap-4 overflow-x-auto pb-4">
      {statuses.filter((s) => s !== "archived").map((status) => (
        <div class="flex-1 min-w-[220px]" key={status}>
          <div class="flex items-center gap-2 mb-3 px-1">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{status}</h3>
            <span class="text-xs text-muted-foreground/60">{(grouped[status] || []).length}</span>
          </div>
          <div class="space-y-2">
            {(grouped[status] || []).map((issue) => (
              <a
                href={`/issues/${issue.id}`}
                class="block rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors group"
                key={issue.id}
              >
                <div class="text-sm font-medium text-card-foreground group-hover:text-foreground">{issue.title}</div>
                <div class="text-xs text-muted-foreground mt-1 font-mono">{issue.id.slice(0, 8)}</div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
