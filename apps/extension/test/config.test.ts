// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@ghazdo/shared";
import { parseWidgetConfig, widgetFilters, widgetKindFromContribution } from "../src/widgets/widgetConfig";
import { decodeView, encodeView } from "../src/urlState";

describe("widget config", () => {
  it("resolves the widget kind from the contribution id", () => {
    expect(widgetKindFromContribution("pub.ghazdo-dashboard.ghazdo-widget-top-repos")).toBe("top-repos");
    expect(widgetKindFromContribution("secrets")).toBe("secrets");
    expect(widgetKindFromContribution("something-else")).toBe("kpi");
  });

  it("parses saved settings defensively", () => {
    expect(parseWidgetConfig("not json")).toEqual({ scope: "project", repositoryIds: [], kinds: [] });
    expect(parseWidgetConfig(JSON.stringify({ scope: "organization", repositoryIds: ["r1"], kinds: ["code", "bogus"] }))).toEqual({
      scope: "organization",
      repositoryIds: ["r1"],
      kinds: ["code"],
    });
  });

  it("forces secret alerts for the secrets widget", () => {
    expect(widgetFilters({ scope: "project", repositoryIds: [], kinds: ["code"] }, "secrets").kinds).toEqual(["secret"]);
  });
});

describe("URL view state", () => {
  const tabs = ["overview", "secrets", "alerts"];

  it("round-trips filters and tab", () => {
    const view = { filters: { ...DEFAULT_FILTERS, projectIds: ["p1"], repositoryIds: ["r1", "r2"], kinds: ["secret" as const] }, tab: "secrets" };
    const decoded = decodeView(`#${encodeView(view)}`, 365, tabs);
    expect(decoded.tab).toBe("secrets");
    expect(decoded.filters.projectIds).toEqual(["p1"]);
    expect(decoded.filters.repositoryIds).toEqual(["r1", "r2"]);
    expect(decoded.filters.kinds).toEqual(["secret"]);
  });

  it("falls back to overview for unknown tabs", () => {
    expect(decodeView("tab=settings", 365, tabs).tab).toBe("overview");
    expect(encodeView({ filters: DEFAULT_FILTERS, tab: "overview" })).not.toContain("tab=");
  });
});
