import { describe, expect, it, vi } from "vitest";
import { AdoClient, collectRepository } from "../src/adoClient.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("AdoClient", () => {
  it("follows continuation tokens and requests all branches and confidence levels", async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      urls.push(url);
      if (!url.includes("continuationToken")) return jsonResponse({ value: [{ alertId: 1, alertType: "code" }] }, 200, { "x-ms-continuationtoken": "tok 2" });
      return jsonResponse({ value: [{ alertId: 2, alertType: "secret" }] });
    });
    const client = new AdoClient({ organization: "contoso", getToken: async () => "t", fetchFn: fetchFn as unknown as typeof fetch });
    const alerts = await client.listAlerts("p1", "r1");
    expect(alerts.map((a) => a.alertId)).toEqual([1, 2]);
    expect(urls[0]).toContain("criteria.onlyDefaultBranch=false");
    expect(urls[0]).toContain("criteria.confidenceLevels=high,other");
    expect(urls[1]).toContain("continuationToken=tok%202");
  });

  it("retries throttling honoring Retry-After", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchFn = async () => (++calls === 1 ? jsonResponse({}, 429, { "Retry-After": "2" }) : jsonResponse({ value: [] }));
    const client = new AdoClient({ organization: "contoso", getToken: async () => "t", fetchFn: fetchFn as unknown as typeof fetch, sleep: async (ms) => void sleeps.push(ms) });
    await client.listAlerts("p1", "r1");
    expect(sleeps).toEqual([2000]);
  });

  it("detects pagination loops", async () => {
    const fetchFn = async () => jsonResponse({ value: [] }, 200, { "x-ms-continuationtoken": "same" });
    const client = new AdoClient({ organization: "contoso", getToken: async () => "t", fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.listAlerts("p1", "r1")).rejects.toThrow(/loop/);
  });

  it("rejects invalid identifiers and organizations", () => {
    expect(() => new AdoClient({ organization: "bad/org", getToken: async () => "t" })).toThrow();
    const client = new AdoClient({ organization: "contoso", getToken: async () => "t" });
    expect(() => client.alertsUrl("../x", "r", "")).toThrow();
  });

  it("records failures truthfully instead of zero alerts", async () => {
    const fetchFn = async (url: string) => (url.includes("enablement") ? jsonResponse({}, 404) : jsonResponse({}, 403));
    const client = new AdoClient({ organization: "contoso", getToken: async () => "t", fetchFn: fetchFn as unknown as typeof fetch });
    const s = await collectRepository(client, { id: "p", name: "P" }, { id: "r", name: "R", projectId: "p", isDisabled: false });
    expect(s.status).toBe("denied");
    expect(s.alerts).toEqual([]);
  });

  it("checks collection admin membership transitively and fails closed", async () => {
    const fetchFn = async (url: string) => {
      if (url.includes("/graph/groups")) return jsonResponse({ value: [{ descriptor: "vssgp.pca", principalName: "[contoso]\\Project Collection Administrators" }] });
      if (url.includes("memberships/aad.user")) return jsonResponse({ value: [{ containerDescriptor: "vssgp.team" }] });
      if (url.includes("memberships/vssgp.team")) return jsonResponse({ value: [{ containerDescriptor: "vssgp.pca" }] });
      return jsonResponse({ value: [] });
    };
    const client = new AdoClient({ organization: "contoso", getToken: async () => "t", fetchFn: fetchFn as unknown as typeof fetch });
    expect(await client.isCollectionAdmin("aad.user")).toBe(true);
    expect(await client.isCollectionAdmin("aad.other")).toBe(false);
    const failing = new AdoClient({ organization: "contoso", getToken: async () => "t", fetchFn: (async () => jsonResponse({}, 500)) as unknown as typeof fetch, maxRetries: 0 });
    expect(await failing.isCollectionAdmin("aad.user")).toBe(false);
  });
});
