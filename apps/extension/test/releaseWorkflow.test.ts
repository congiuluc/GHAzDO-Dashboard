import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../../.github/workflows/release.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const publishStep = workflow.split("      - name: Publish\n")[1]?.split("\n  docs:")[0];
const runBlock = publishStep?.split("        run: |\n")[1];
if (!runBlock) throw new Error("Marketplace publish step not found");
const script = runBlock.split("\n").map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n");

const bin = mkdtempSync(join(tmpdir(), "ghazdo-release-test-"));
const npx = join(bin, "npx");
writeFileSync(npx, `#!/usr/bin/env bash
case "$4" in
  publish) echo "mock publish" >&2; exit "$PUBLISH_STATUS" ;;
  show) echo "mock lookup" >&2; exit "$LOOKUP_STATUS" ;;
  *) echo "unexpected command" >&2; exit 97 ;;
esac
`);
chmodSync(npx, 0o755);
afterAll(() => rmSync(bin, { recursive: true, force: true }));

function runPublish(publishStatus: number, lookupStatus: number) {
  const result = spawnSync("bash", ["-e", "-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      MARKETPLACE_PAT: "test-only-token",
      VSIX: "out/test.vsix",
      SHARE_WITH: "",
      PUBLISH_STATUS: String(publishStatus),
      LOOKUP_STATUS: String(lookupStatus),
    },
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("Marketplace publish diagnostics", () => {
  it("does not perform a lookup after a successful publish", () => {
    const result = runPublish(0, 0);
    expect(result.status).toBe(0);
    expect(result.output).toContain("mock publish");
    expect(result.output).not.toContain("mock lookup");
  });

  it("preserves a publish failure when the diagnostic lookup succeeds", () => {
    const result = runPublish(1, 0);
    expect(result.status).toBe(1);
    expect(result.output).toContain("mock publish");
    expect(result.output).toContain("mock lookup");
    expect(result.output).toContain("Marketplace lookup succeeded");
  });

  it("reports a lookup failure without exposing the token", () => {
    const result = runPublish(1, 1);
    expect(result.status).toBe(1);
    expect(result.output).toContain("mock lookup");
    expect(result.output).toContain("Marketplace lookup failed");
    expect(result.output).not.toContain("test-only-token");
  });
});
