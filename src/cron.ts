export interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
}

export function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  const parts = field.split(",");

  for (const part of parts) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid step value: ${stepStr}`);

      let start = min;
      let end = max;

      if (range !== "*") {
        if (range.includes("-")) {
          const [s, e] = range.split("-").map(Number);
          start = s;
          end = e;
        } else {
          start = parseInt(range, 10);
        }
      }

      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: ${range}`);
      if (start < min || end > max) throw new Error(`Range ${start}-${end} out of bounds (${min}-${max})`);

      for (let i = start; i <= end; i += step) {
        result.add(i);
      }
    } else if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: ${part}`);
      if (start < min || end > max) throw new Error(`Range ${part} out of bounds (${min}-${max})`);

      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      const val = parseInt(part, 10);
      if (isNaN(val)) throw new Error(`Invalid value: ${part}`);
      if (val < min || val > max) throw new Error(`Value ${val} out of range (${min}-${max})`);
      result.add(val);
    }
  }

  return result;
}

export function parseCronExpression(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expr}"`);
  }

  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

/** Cron expressions are evaluated in server-local time, matching standard crontab behavior. */
export function shouldFire(expr: string, date: Date): boolean {
  const fields = parseCronExpression(expr);
  return (
    fields.minute.has(date.getMinutes()) &&
    fields.hour.has(date.getHours()) &&
    fields.dayOfMonth.has(date.getDate()) &&
    fields.month.has(date.getMonth() + 1) &&
    fields.dayOfWeek.has(date.getDay())
  );
}

export function validateCron(expr: string): { valid: boolean; error?: string } {
  try {
    parseCronExpression(expr);
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export function getNextFire(expr: string, after: Date): Date {
  const fields = parseCronExpression(expr);
  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Search up to 2 years ahead
  const limit = new Date(after);
  limit.setFullYear(limit.getFullYear() + 2);

  while (candidate < limit) {
    if (
      fields.minute.has(candidate.getMinutes()) &&
      fields.hour.has(candidate.getHours()) &&
      fields.dayOfMonth.has(candidate.getDate()) &&
      fields.month.has(candidate.getMonth() + 1) &&
      fields.dayOfWeek.has(candidate.getDay())
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`No next fire time found within 2 years for: ${expr}`);
}
