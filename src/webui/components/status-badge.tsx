/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";

const STATUS_STYLES: Record<string, string> = {
  "todo": "bg-zinc-700/50 text-zinc-300 border-zinc-600",
  "in-progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "review": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "done": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "archived": "bg-zinc-700/30 text-zinc-500 border-zinc-600/50",
  "running": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "success": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "failed": "bg-red-500/15 text-red-400 border-red-500/30",
  "timeout": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "cancelled": "bg-zinc-700/30 text-zinc-500 border-zinc-600/50",
};

export const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const styles = STATUS_STYLES[status] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600";
  return (
    <span class={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border ${styles}`}>
      {status}
    </span>
  );
};
