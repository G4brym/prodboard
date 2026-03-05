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
    <div class="board">
      {statuses.filter((s) => s !== "archived").map((status) => (
        <div class="board-column" key={status}>
          <h3>
            {status} <span class="count">({(grouped[status] || []).length})</span>
          </h3>
          {(grouped[status] || []).map((issue) => (
            <a href={`/issues/${issue.id}`} class="card" key={issue.id}>
              <div class="card-title">{issue.title}</div>
              <div class="card-meta">{issue.id.slice(0, 8)}</div>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
};
