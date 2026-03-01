import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SERVICE_NAME = "prodboard";
const SERVICE_DIR = path.join(os.homedir(), ".config", "systemd", "user");
const SERVICE_PATH = path.join(SERVICE_DIR, `${SERVICE_NAME}.service`);

function parseArgs(args: string[]): { flags: Record<string, boolean> } {
  const flags: Record<string, boolean> = {};
  for (const arg of args) {
    if (arg === "--force" || arg === "-f") {
      flags.force = true;
    }
  }
  return { flags };
}

async function systemctlAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["systemctl", "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

async function runSystemctl(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["systemctl", "--user", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export function generateServiceFile(bunPath: string, prodboardPath: string, home: string): string {
  return `[Unit]
Description=prodboard scheduler daemon
After=network.target

[Service]
Type=simple
ExecStart=${bunPath} run ${prodboardPath} daemon
Restart=on-failure
RestartSec=10
Environment="HOME=${home}"

[Install]
WantedBy=default.target
`;
}

export async function install(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);

  if (!(await systemctlAvailable())) {
    console.error("systemd is not available on this system.");
    console.error("The install command requires systemd (Linux).");
    process.exit(1);
  }

  const alreadyInstalled = fs.existsSync(SERVICE_PATH);

  if (alreadyInstalled && !flags.force) {
    console.log("prodboard is already installed as a systemd service. Restarting...");
    await runSystemctl("restart", SERVICE_NAME);
    const { stdout } = await runSystemctl("status", SERVICE_NAME);
    console.log(stdout);
    return;
  }

  const bunPath = Bun.which("bun") ?? process.execPath;
  const prodboardPath = Bun.which("prodboard") ?? `${bunPath} x prodboard`;
  const home = os.homedir();

  const serviceContent = generateServiceFile(bunPath, prodboardPath, home);

  fs.mkdirSync(SERVICE_DIR, { recursive: true });
  fs.writeFileSync(SERVICE_PATH, serviceContent);
  console.log(`Service file written to ${SERVICE_PATH}`);

  const reload = await runSystemctl("daemon-reload");
  if (reload.exitCode !== 0) {
    console.error("Failed to reload systemd:", reload.stderr);
    process.exit(1);
  }

  const enable = await runSystemctl("enable", SERVICE_NAME);
  if (enable.exitCode !== 0) {
    console.error("Failed to enable service:", enable.stderr);
    process.exit(1);
  }

  const start = await runSystemctl("restart", SERVICE_NAME);
  if (start.exitCode !== 0) {
    console.error("Failed to start service:", start.stderr);
    process.exit(1);
  }

  console.log("prodboard service installed, enabled, and started.");
  const { stdout } = await runSystemctl("status", SERVICE_NAME);
  console.log(stdout);
}

export async function uninstall(_args: string[]): Promise<void> {
  if (!fs.existsSync(SERVICE_PATH)) {
    console.log("prodboard is not installed as a systemd service.");
    return;
  }

  await runSystemctl("stop", SERVICE_NAME);
  await runSystemctl("disable", SERVICE_NAME);

  fs.unlinkSync(SERVICE_PATH);
  console.log(`Removed ${SERVICE_PATH}`);

  await runSystemctl("daemon-reload");
  console.log("prodboard service uninstalled.");
}
