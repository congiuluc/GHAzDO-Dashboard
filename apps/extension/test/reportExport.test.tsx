import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { it, expect } from "vitest";
import { aggregate, DEFAULT_FILTERS, type NormalizedAlert, type RepoSnapshot } from "@ghazdo/shared";
import { exportPowerPoint } from "../src/components/ReportExport";

it("exports a valid posture PowerPoint", async () => {
  const title = `QA Fixture ${randomUUID()}`;
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-posture.pptx`;
  const data = aggregate({
    organization: "sample-org",
    snapshots: [{
      projectId: "project-1",
      projectName: "Payments",
      repositoryId: "repo-1",
      repositoryName: "api",
      collectedAt: "2025-01-15T11:00:00Z",
      status: "ok",
      enablement: { code: true, dependency: true, secret: false },
      alerts: [
        { key: "critical", alertId: 1, projectId: "project-1", repositoryId: "repo-1", kind: "code", rawType: "code", severity: "critical", rawSeverity: "critical", state: "active", rawState: "active", title: "SQL injection", firstSeen: "2025-01-01T00:00:00Z" },
        { key: "high", alertId: 2, projectId: "project-1", repositoryId: "repo-1", kind: "code", rawType: "code", severity: "high", rawSeverity: "high", state: "active", rawState: "active", title: "Unsafe deserialization", firstSeen: "2025-01-07T00:00:00Z" },
        { key: "dependency", alertId: 3, projectId: "project-1", repositoryId: "repo-1", kind: "dependency", rawType: "dependency", severity: "high", rawSeverity: "high", state: "active", rawState: "active", title: "Vulnerable package", firstSeen: "2025-01-10T00:00:00Z", packageName: "lodash", fixedVersion: "4.17.21", ecosystem: "npm" },
        { key: "dismissed", alertId: 4, projectId: "project-1", repositoryId: "repo-1", kind: "code", rawType: "code", severity: "medium", rawSeverity: "medium", state: "dismissed", rawState: "dismissed", title: "Dismissed alert", firstSeen: "2025-01-08T00:00:00Z", dismissal: { reason: "falsepositive", actor: "Security Owner" } },
      ] satisfies NormalizedAlert[],
    } satisfies RepoSnapshot],
    observations: [],
    filters: DEFAULT_FILTERS,
    scope: { kind: "organization" },
    now: new Date("2025-01-15T12:00:00Z"),
  });

  try {
    await exportPowerPoint(data, title, DEFAULT_FILTERS);
    const bytes = await readFile(filename);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  } finally {
    await rm(filename, { force: true });
  }
});
