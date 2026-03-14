# Schedule Model Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow per-schedule and global-default model selection for both Claude and OpenCode agents.

**Architecture:** Add a nullable `model` column to the `schedules` table and a `model` field to `Config.daemon`. When building agent commands, schedule-level model takes priority over config-level, which takes priority over the agent's own default. Both drivers already accept `--model`, so this is plumbing the value through.

**Tech Stack:** Bun, TypeScript, bun:sqlite, Bun test runner

---

## Chunk 1: Data Layer + Drivers

### Task 1: Add `model` column to schedules (DB migration)

**Files:**
- Modify: `src/db.ts` (add migration v3)
- Modify: `src/types.ts` (add `model` to `Schedule` interface)

- [ ] **Step 1: Write the failing test**

In `tests/db.test.ts`, add a test that checks the `model` column exists after migrations:

```ts
test("migration v3 adds model column to schedules", () => {
  const cols = db.query("PRAGMA table_info(schedules)").all() as any[];
  const modelCol = cols.find((c: any) => c.name === "model");
  expect(modelCol).toBeTruthy();
  expect(modelCol.type).toBe("TEXT");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/db.test.ts`
Expected: FAIL — no `model` column exists

- [ ] **Step 3: Add migration v3 and update Schedule type**

In `src/db.ts`, add to `MIGRATIONS` array:

```ts
{
  version: 3,
  sql: `ALTER TABLE schedules ADD COLUMN model TEXT;`,
},
```

In `src/types.ts`, add to `Schedule` interface after `persist_session`:

```ts
model: string | null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/types.ts tests/db.test.ts
git commit -m "feat: add model column to schedules table (migration v3)"
```

---

### Task 2: Add `model` to `Config.daemon`

**Files:**
- Modify: `src/types.ts` (add `model` to `Config.daemon`)
- Modify: `src/config.ts` (add default)
- Modify: `tests/helpers.ts` (add to `createTestConfig` defaults)

- [ ] **Step 1: Update `Config` interface**

In `src/types.ts`, add to the `daemon` section after `agent`:

```ts
model: string | null;
```

- [ ] **Step 2: Add default in `config.ts`**

In `src/config.ts` `getDefaults()`, add after `agent: "claude"`:

```ts
model: null,
```

- [ ] **Step 3: Update test helper**

In `tests/helpers.ts`, add to the `daemon` defaults after `agent: "claude"`:

```ts
model: null,
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/config.ts tests/helpers.ts
git commit -m "feat: add daemon.model to config for global default model"
```

---

### Task 3: Wire `model` through schedule queries

**Files:**
- Modify: `src/queries/schedules.ts` (accept `model` in create/update)

- [ ] **Step 1: Write failing tests**

In `tests/schedules.test.ts`, add:

```ts
test("create schedule with model", () => {
  const s = createSchedule(db, {
    name: "test", cron: "* * * * *", prompt: "go", model: "claude-sonnet-4-6",
  });
  expect(s.model).toBe("claude-sonnet-4-6");
});

test("create schedule without model defaults to null", () => {
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
  expect(s.model).toBeNull();
});

test("update schedule model", () => {
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
  const updated = updateSchedule(db, s.id, { model: "claude-opus-4-6" });
  expect(updated.model).toBe("claude-opus-4-6");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/schedules.test.ts`
Expected: FAIL — `model` not accepted / not returned

- [ ] **Step 3: Update `createSchedule`**

In `src/queries/schedules.ts`, add `model?: string` to the `opts` type. Update the INSERT:

```ts
export function createSchedule(
  db: Database,
  opts: {
    name: string;
    cron: string;
    prompt: string;
    workdir?: string;
    max_turns?: number;
    allowed_tools?: string;
    use_worktree?: boolean;
    inject_context?: boolean;
    persist_session?: boolean;
    agents_json?: string;
    source?: string;
    model?: string;
  }
): Schedule {
  const id = generateId();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  db.query(`
    INSERT INTO schedules (id, name, cron, prompt, workdir, max_turns, allowed_tools,
      use_worktree, inject_context, persist_session, agents_json, source, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, opts.name, opts.cron, opts.prompt,
    opts.workdir ?? ".",
    opts.max_turns ?? null,
    opts.allowed_tools ?? null,
    opts.use_worktree !== false ? 1 : 0,
    opts.inject_context !== false ? 1 : 0,
    opts.persist_session ? 1 : 0,
    opts.agents_json ?? null,
    opts.source ?? "cli",
    opts.model ?? null,
    now, now
  );

  return getSchedule(db, id)!;
}
```

- [ ] **Step 4: Update `updateSchedule` fieldMap**

In `src/queries/schedules.ts`, add to the `fieldMap` object:

```ts
model: "model",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/schedules.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/queries/schedules.ts tests/schedules.test.ts
git commit -m "feat: wire model field through schedule create/update queries"
```

---

### Task 4: ClaudeDriver passes `--model`

**Files:**
- Modify: `src/agents/claude.ts`

- [ ] **Step 1: Write failing tests**

In `tests/agents-claude.test.ts`, add:

```ts
test("buildCommand passes --model from schedule", () => {
  const s = createSchedule(db, {
    name: "test", cron: "* * * * *", prompt: "go", model: "claude-sonnet-4-6",
  });
  const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
  const args = driver.buildCommand(makeCtx({ schedule: s, run: r }));
  const idx = args.indexOf("--model");
  expect(idx).not.toBe(-1);
  expect(args[idx + 1]).toBe("claude-sonnet-4-6");
});

test("buildCommand passes --model from config when schedule has none", () => {
  const config = createTestConfig({ daemon: { model: "claude-haiku-4-5-20251001" } });
  const args = driver.buildCommand(makeCtx({ config }));
  const idx = args.indexOf("--model");
  expect(idx).not.toBe(-1);
  expect(args[idx + 1]).toBe("claude-haiku-4-5-20251001");
});

test("buildCommand schedule model overrides config model", () => {
  const config = createTestConfig({ daemon: { model: "claude-haiku-4-5-20251001" } });
  const s = createSchedule(db, {
    name: "test", cron: "* * * * *", prompt: "go", model: "claude-opus-4-6",
  });
  const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
  const args = driver.buildCommand(makeCtx({ schedule: s, run: r, config }));
  const idx = args.indexOf("--model");
  expect(idx).not.toBe(-1);
  expect(args[idx + 1]).toBe("claude-opus-4-6");
});

test("buildCommand omits --model when neither schedule nor config sets it", () => {
  const args = driver.buildCommand(makeCtx());
  expect(args).not.toContain("--model");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/agents-claude.test.ts`
Expected: FAIL — `--model` not in output

- [ ] **Step 3: Implement in ClaudeDriver**

In `src/agents/claude.ts`, add after the `agents_json` block (before `return args`):

```ts
const model = schedule.model ?? config.daemon.model;
if (model) {
  args.push("--model", model);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/agents-claude.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agents/claude.ts tests/agents-claude.test.ts
git commit -m "feat: ClaudeDriver passes --model flag from schedule or config"
```

---

### Task 5: OpenCodeDriver uses schedule model with fallback

**Files:**
- Modify: `src/agents/opencode.ts`

- [ ] **Step 1: Write failing tests**

In `tests/agents-opencode.test.ts`, add (check existing test structure first — follow the same `makeCtx` pattern):

```ts
test("buildCommand uses schedule.model over config.daemon.opencode.model", () => {
  const config = createTestConfig({
    daemon: { agent: "opencode", opencode: { model: "anthropic/claude-sonnet" } },
  });
  const s = createSchedule(db, {
    name: "test", cron: "* * * * *", prompt: "go", model: "anthropic/claude-opus",
  });
  const r = createRun(db, { schedule_id: s.id, prompt_used: "go" });
  const args = driver.buildCommand(makeCtx({ schedule: s, run: r, config }));
  const idx = args.indexOf("--model");
  expect(idx).not.toBe(-1);
  expect(args[idx + 1]).toBe("anthropic/claude-opus");
});

test("buildCommand falls back to config.daemon.model for opencode", () => {
  const config = createTestConfig({
    daemon: { agent: "opencode", model: "anthropic/claude-sonnet" },
  });
  const args = driver.buildCommand(makeCtx({ config }));
  const idx = args.indexOf("--model");
  expect(idx).not.toBe(-1);
  expect(args[idx + 1]).toBe("anthropic/claude-sonnet");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/agents-opencode.test.ts`
Expected: FAIL

- [ ] **Step 3: Update OpenCodeDriver**

In `src/agents/opencode.ts`, replace the model logic:

```ts
const model = schedule.model ?? config.daemon.opencode.model ?? config.daemon.model;
if (model) {
  args.push("--model", model);
}
```

(Remove the existing `if (opencode.model)` block and replace with this.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/agents-opencode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agents/opencode.ts tests/agents-opencode.test.ts
git commit -m "feat: OpenCodeDriver uses schedule model with fallback chain"
```

---

## Chunk 2: CLI + MCP + Config Template

### Task 6: CLI `schedule add` and `schedule edit` accept `--model`

**Files:**
- Modify: `src/commands/schedules.ts`

- [ ] **Step 1: Write failing tests**

In `tests/commands-schedules.test.ts`, add:

```ts
test("schedule add accepts --model", async () => {
  const { stdout } = await captureOutput(async () => {
    await scheduleAdd(["--name", "test", "--cron", "* * * * *", "--prompt", "go", "--model", "claude-sonnet-4-6"], db);
  });
  expect(stdout).toContain("Created schedule");

  // Verify model was stored
  const schedules = db.query("SELECT * FROM schedules").all() as any[];
  expect(schedules[0].model).toBe("claude-sonnet-4-6");
});

test("schedule edit accepts --model", async () => {
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
  await captureOutput(async () => {
    await scheduleEdit([s.id, "--model", "claude-opus-4-6"], db);
  });
  const updated = db.query("SELECT * FROM schedules WHERE id = ?").get(s.id) as any;
  expect(updated.model).toBe("claude-opus-4-6");
});

test("schedule edit --model empty string clears model", async () => {
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go", model: "claude-opus-4-6" });
  await captureOutput(async () => {
    await scheduleEdit([s.id, "--model", ""], db);
  });
  const updated = db.query("SELECT * FROM schedules WHERE id = ?").get(s.id) as any;
  expect(updated.model).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/commands-schedules.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `scheduleAdd`**

In `src/commands/schedules.ts`, in `scheduleAdd`, pass model to `createSchedule`:

```ts
const schedule = createSchedule(db, {
  name,
  cron,
  prompt,
  workdir: (flags.workdir ?? flags.w) as string | undefined,
  max_turns: flags["max-turns"] ? parseInt(flags["max-turns"] as string, 10) : undefined,
  use_worktree: !flags["no-worktree"],
  inject_context: !flags["no-context"],
  persist_session: !!flags["persist-session"],
  model: flags.model as string | undefined,
});
```

- [ ] **Step 4: Update `scheduleEdit`**

In `src/commands/schedules.ts`, in `scheduleEdit`, add after the `max-turns` handling:

```ts
if (flags.model !== undefined) fields.model = flags.model === "" ? null : flags.model;
```

This allows `--model ""` to clear the model back to null.

- [ ] **Step 5: Update `scheduleLs` to show model column**

In `src/commands/schedules.ts`, update the `scheduleLs` table rendering to include a Model column. Update the `renderTable` call:

```ts
const table = renderTable(
  ["ID", "Name", "Cron", "Model", "Enabled", "Next Fire"],
  schedules.map((s) => {
    let nextFire = "";
    try {
      const next = getNextFire(s.cron, new Date());
      nextFire = formatDate(next.toISOString());
    } catch {}
    return [s.id, s.name, s.cron, s.model ?? "-", s.enabled ? "yes" : "no", nextFire];
  }),
  { maxWidths: [10, 30, 20, 20, 8, 18] }
);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/commands-schedules.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/commands/schedules.ts tests/commands-schedules.test.ts
git commit -m "feat: CLI schedule add/edit accept --model flag, show model in ls"
```

---

### Task 7: MCP `create_schedule` and `update_schedule` accept `model`

**Files:**
- Modify: `src/mcp.ts`

- [ ] **Step 1: Write failing tests**

In `tests/mcp-schedules.test.ts`, add:

```ts
test("create_schedule accepts model", async () => {
  const result = await handleCreateSchedule(db, {
    name: "test", cron: "0 9 * * *", prompt: "go", model: "claude-sonnet-4-6",
  });
  expect(result.model).toBe("claude-sonnet-4-6");
});

test("update_schedule accepts model", async () => {
  const s = createSchedule(db, { name: "test", cron: "* * * * *", prompt: "go" });
  const result = await handleUpdateSchedule(db, { id: s.id, model: "claude-opus-4-6" });
  expect(result.model).toBe("claude-opus-4-6");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/mcp-schedules.test.ts`
Expected: FAIL

- [ ] **Step 3: Update MCP tool schemas**

In `src/mcp.ts`, in the `create_schedule` tool definition, add to `properties`:

```ts
model: { type: "string" as const, description: "Model to use for this schedule (e.g. claude-sonnet-4-6)" },
```

In the `update_schedule` tool definition, add to `properties`:

```ts
model: { type: "string" as const, description: "Model override (empty string to clear)" },
```

- [ ] **Step 4: Update MCP handlers**

In `handleCreateSchedule`, pass model through:

```ts
return sq.createSchedule(db, {
  name: params.name,
  cron: params.cron,
  prompt: params.prompt,
  workdir: params.workdir,
  max_turns: params.max_turns,
  model: params.model,
  source: "mcp",
});
```

In `handleUpdateSchedule`, add:

```ts
if (params.model !== undefined) fields.model = params.model === "" ? null : params.model;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/mcp-schedules.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/mcp.ts tests/mcp-schedules.test.ts
git commit -m "feat: MCP create/update schedule tools accept model parameter"
```

---

### Task 8: Update config template and add changeset

**Files:**
- Modify: `templates/config.jsonc`

- [ ] **Step 1: Update config template**

In `templates/config.jsonc`, add after the `// "agent": "claude",` line:

```jsonc
    // Default model for agent runs (null = agent's default)
    // For Claude: "claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"
    // For OpenCode: "anthropic/claude-sonnet-4-20250514", etc.
    // Can be overridden per-schedule with --model
    // "model": null,
```

- [ ] **Step 2: Run full test suite**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Add changeset**

Run: `bunx changeset` and select minor bump with message:
"Add per-schedule and global model selection for Claude and OpenCode agents"

- [ ] **Step 5: Commit**

```bash
git add templates/config.jsonc .changeset/
git commit -m "feat: document model config option and add changeset"
```
