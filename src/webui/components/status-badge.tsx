/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";

const STATUS_COLORS: Record<string, string> = {
  "todo": "#6b7280",
  "in-progress": "#3b82f6",
  "review": "#f59e0b",
  "done": "#10b981",
  "archived": "#9ca3af",
  "running": "#3b82f6",
  "success": "#10b981",
  "failed": "#ef4444",
  "timeout": "#f59e0b",
  "cancelled": "#9ca3af",
};

export const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span class="badge" style={`background:${color}`}>
      {status}
    </span>
  );
};
