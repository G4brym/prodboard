const NO_COLOR = !!process.env.NO_COLOR;

export function color(text: string, code: number): string {
  if (NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export function dim(text: string): string {
  return color(text, 2);
}
export function bold(text: string): string {
  return color(text, 1);
}
export function green(text: string): string {
  return color(text, 32);
}
export function red(text: string): string {
  return color(text, 31);
}
export function yellow(text: string): string {
  return color(text, 33);
}
export function cyan(text: string): string {
  return color(text, 36);
}

export function renderTable(
  headers: string[],
  rows: string[][],
  options?: { maxWidths?: number[] }
): string {
  const maxWidths = options?.maxWidths;

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      if (row[i] && row[i].length > max) max = row[i].length;
    }
    if (maxWidths && maxWidths[i] && max > maxWidths[i]) {
      max = maxWidths[i];
    }
    return max;
  });

  function truncate(text: string, width: number): string {
    if (text.length <= width) return text;
    return text.slice(0, width - 1) + "…";
  }

  function pad(text: string, width: number): string {
    const t = truncate(text, width);
    return t + " ".repeat(Math.max(0, width - t.length));
  }

  const top =
    "┌" + colWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const mid =
    "├" + colWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const bot =
    "└" + colWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  const headerRow =
    "│" +
    headers.map((h, i) => " " + pad(h, colWidths[i]) + " ").join("│") +
    "│";

  const dataRows = rows.map(
    (row) =>
      "│" +
      row
        .map((cell, i) => " " + pad(cell ?? "", colWidths[i]) + " ")
        .join("│") +
      "│"
  );

  const lines = [top, headerRow];
  if (rows.length > 0) {
    lines.push(mid);
    lines.push(...dataRows);
  }
  lines.push(bot);
  return lines.join("\n");
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.includes("Z") || iso.includes("+") ? "" : "Z"));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${min}`;
}

export function jsonOutput(data: unknown): string {
  return JSON.stringify(data);
}
