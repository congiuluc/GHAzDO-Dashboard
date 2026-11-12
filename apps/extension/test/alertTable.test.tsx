// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AlertSummary } from "@ghazdo/shared";
import { collectCsvExportAlerts, MAX_CSV_EXPORT_ALERTS, ReportedRef } from "../src/components/AlertTable";

function alert(alertId: number): AlertSummary {
  return {
    key: `alert-${alertId}`,
    alertId,
    projectId: "project",
    repositoryId: "repository",
    kind: "code",
    rawType: "code",
    severity: "high",
    rawSeverity: "high",
    state: "active",
    rawState: "active",
    title: `Alert ${alertId}`,
    projectName: "Project",
    repositoryName: "Repository",
    url: "https://github.com/org/repo/security/code-scanning/1",
  };
}

describe("reported alert refs", () => {
  it.each([
    ["refs/heads/feature/payments", "feature/payments"],
    ["refs/pull/42/merge", "refs/pull/42/merge"],
    ["refs/heads/", "refs/heads/"],
  ])("displays %s as %s and retains the full ref", (gitRef, label) => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ReportedRef gitRef={gitRef} />);
    const ref = container.querySelector("span");
    expect(ref?.textContent).toBe(label);
    expect(ref?.title).toBe(gitRef);
  });

  it("does not assume a branch when no ref is reported", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ReportedRef />);
    expect(container.textContent).toBe("Not reported");
    expect(container.querySelector("span")?.hasAttribute("title")).toBe(false);
  });

  it("caps CSV export at 50,000 alerts and reports when more pages remain", async () => {
    let fetched = 0;
    const result = await collectCsvExportAlerts(async (cursor, pageSize) => {
      expect(cursor).toBe(fetched ? String(fetched) : undefined);
      const start = fetched;
      fetched += pageSize;
      return {
        items: Array.from({ length: pageSize }, (_, index) => alert(start + index)),
        total: MAX_CSV_EXPORT_ALERTS + 1,
        nextCursor: String(fetched),
      };
    });

    expect(result.items).toHaveLength(MAX_CSV_EXPORT_ALERTS);
    expect(result.truncated).toBe(true);
    expect(fetched).toBe(MAX_CSV_EXPORT_ALERTS);
  });
});
