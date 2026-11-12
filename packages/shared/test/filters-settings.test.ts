import { describe, expect, it } from "vitest";
import { applyScope, filtersFromQuery, filtersToQuery, sanitizeFilters } from "../src/filters.js";
import { retentionCutoffDay, isExpired } from "../src/retention.js";
import { parseSettings, validateBackendUrl, validateHistoryDays } from "../src/settings.js";

describe("filters", () => {
  it("round-trips through the URL and drops invalid values", () => {
    const f = sanitizeFilters({ projectIds: ["p1", "bad id!"], kinds: ["secret", "nope"], periodDays: 9999, search: "x" }, 90);
    expect(f).toMatchObject({ projectIds: ["p1"], kinds: ["secret"], periodDays: 90 });
    expect(filtersFromQuery(filtersToQuery(f), 90)).toEqual(f);
  });

  it("locks the project in project scope", () => {
    const f = sanitizeFilters({ projectIds: ["other"] });
    expect(applyScope(f, { kind: "project", projectId: "mine" }).projectIds).toEqual(["mine"]);
  });
});

describe("settings validation", () => {
  const allow = ["https://ghazdo.azurewebsites.net"];
  it("accepts only allowlisted HTTPS origins without credentials or query", () => {
    expect(validateBackendUrl("https://ghazdo.azurewebsites.net/", allow)).toEqual({ ok: true, value: "https://ghazdo.azurewebsites.net" });
    expect(validateBackendUrl("", allow)).toEqual({ ok: true, value: "" });
    expect(validateBackendUrl("http://ghazdo.azurewebsites.net", allow).ok).toBe(false);
    expect(validateBackendUrl("https://evil.example.com", allow).ok).toBe(false);
    expect(validateBackendUrl("https://u:p@ghazdo.azurewebsites.net", allow).ok).toBe(false);
    expect(validateBackendUrl("https://ghazdo.azurewebsites.net/?a=1", allow).ok).toBe(false);
  });

  it("validates history days bounds", () => {
    expect(validateHistoryDays(1)).toEqual({ ok: true, value: 1 });
    expect(validateHistoryDays("365")).toEqual({ ok: true, value: 365 });
    expect(validateHistoryDays(0).ok).toBe(false);
    expect(validateHistoryDays(366).ok).toBe(false);
    expect(validateHistoryDays(1.5).ok).toBe(false);
    expect(parseSettings({ maxHistoryDays: 999 }).maxHistoryDays).toBe(90);
  });
});

describe("retention", () => {
  it("keeps exactly maxHistoryDays UTC days including today", () => {
    const now = new Date("2024-03-10T23:30:00Z");
    expect(retentionCutoffDay(1, now)).toBe("2024-03-10");
    expect(retentionCutoffDay(10, now)).toBe("2024-03-01");
    expect(isExpired("2024-02-29", 10, now)).toBe(true);
    expect(isExpired("2024-03-01", 10, now)).toBe(false);
  });
});
