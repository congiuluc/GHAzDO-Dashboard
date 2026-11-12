import { describe, expect, it } from "vitest";
import { groupAlertsByProject, workItemDescription } from "../src/data/workItems";
import type { AlertSummary } from "@ghazdo/shared";

function alert(projectId: string, url = "https://dev.azure.com/org/project/_git/repo/alerts/1"): AlertSummary {
  return {
    key: `${projectId}/repo/1`,
    alertId: 1,
    projectId,
    repositoryId: "repo",
    kind: "code",
    rawType: "code",
    severity: "high",
    rawSeverity: "high",
    state: "active",
    rawState: "active",
    title: "<unsafe & alert>",
    projectName: projectId,
    repositoryName: "repo",
    url,
  };
}

describe("work item helpers", () => {
  it("groups selected alerts by project", () => {
    const groups = groupAlertsByProject([alert("p1"), alert("p2"), alert("p1")]);
    expect([...groups].map(([project, alerts]) => [project, alerts.length])).toEqual([["p1", 2], ["p2", 1]]);
  });

  it("escapes alert HTML and links only to HTTPS URLs", () => {
    const description = workItemDescription([alert("p1"), alert("p1", "javascript:alert(1)")]);
    expect(description).toContain("&lt;unsafe &amp; alert&gt;");
    expect(description).toContain('href="https://dev.azure.com/org/project/_git/repo/alerts/1"');
    expect(description).not.toContain('href="javascript:');
  });
});
