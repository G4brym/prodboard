export interface Config {
  general: {
    statuses: string[];
    defaultStatus: string;
    idPrefix: string;
  };
  daemon: {
    agent: "claude" | "opencode";
    basePath: string | null;
    useTmux: boolean;
    opencode: {
      serverUrl: string | null;
      model: string | null;
      agent: string | null;
    };
    maxConcurrentRuns: number;
    maxTurns: number;
    hardMaxTurns: number;
    runTimeoutSeconds: number;
    runRetentionDays: number;
    logLevel: string;
    logMaxSizeMb: number;
    logMaxFiles: number;
    defaultAllowedTools: string[];
    nonGitDefaultAllowedTools: string[];
    useWorktrees: "auto" | "always" | "never";
  };
  webui: {
    enabled: boolean;
    port: number;
    hostname: string;
    password: string | null;
  };
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  issue_id: string;
  body: string;
  author: string;
  created_at: string;
}

export interface Schedule {
  id: string;
  name: string;
  cron: string;
  prompt: string;
  workdir: string;
  enabled: number;
  max_turns: number | null;
  allowed_tools: string | null;
  use_worktree: number;
  inject_context: number;
  persist_session: number;
  model: string | null;
  agents_json: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  schedule_id: string;
  status: string;
  prompt_used: string;
  pid: number | null;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  stdout_tail: string | null;
  stderr_tail: string | null;
  session_id: string | null;
  worktree_path: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  tools_used: string | null;
  issues_touched: string | null;
  tmux_session: string | null;
  agent: string;
  schedule_name?: string;
}

export interface EnvironmentInfo {
  hasGit: boolean;
  hasClaude: boolean;
  hasOpencode: boolean;
  worktreeSupported: boolean;
}
