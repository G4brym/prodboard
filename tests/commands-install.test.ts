import { describe, expect, test } from "bun:test";
import { generateServiceFile } from "../src/commands/install.ts";

describe("install command", () => {
  test("generateServiceFile produces valid systemd unit", () => {
    const result = generateServiceFile("/usr/bin/bun", "/usr/bin/prodboard", "/home/testuser");

    expect(result).toContain("[Unit]");
    expect(result).toContain("[Service]");
    expect(result).toContain("[Install]");
    expect(result).toContain("ExecStart=/usr/bin/bun run /usr/bin/prodboard daemon");
    expect(result).toContain('Environment="HOME=/home/testuser"');
    expect(result).toContain("Restart=on-failure");
    expect(result).toContain("WantedBy=default.target");
  });

  test("generateServiceFile uses provided paths", () => {
    const result = generateServiceFile("/custom/bun", "/custom/prodboard", "/home/custom");

    expect(result).toContain("ExecStart=/custom/bun run /custom/prodboard daemon");
    expect(result).toContain('Environment="HOME=/home/custom"');
  });

  test("generateServiceFile includes network dependency", () => {
    const result = generateServiceFile("/usr/bin/bun", "/usr/bin/prodboard", "/home/testuser");

    expect(result).toContain("After=network.target");
  });

  test("generateServiceFile sets restart policy", () => {
    const result = generateServiceFile("/usr/bin/bun", "/usr/bin/prodboard", "/home/testuser");

    expect(result).toContain("RestartSec=10");
    expect(result).toContain("Type=simple");
  });
});
