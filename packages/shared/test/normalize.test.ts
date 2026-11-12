import { describe, expect, it } from "vitest";
import { dedupeAlerts, normalizeAlert, parsePackage } from "../src/normalize.js";

describe("normalizeAlert", () => {
  it("keeps allowlisted secret metadata and never the secret value", () => {
    const a = normalizeAlert(
      {
        alertId: 7,
        alertType: "secret",
        severity: "critical",
        state: "active",
        title: "Azure Storage key",
        truncatedSecret: "abc***",
        tools: [{ name: "AdvancedSecurity", rules: [{ opaqueId: "SEC101/102", friendlyName: "AzureStorageAccountKey" }] }],
        validityDetails: { validityStatus: "Active" },
        physicalLocations: [{ filePath: "secret.txt" }],
      },
      "p1",
      "r1",
      "Contoso",
    )!;
    expect(a.secretType).toBe("AzureStorageAccountKey");
    expect(a.validity).toBe("active");
    expect(a.key).toBe("contoso/p1/r1/7");
    expect(JSON.stringify(a)).not.toContain("abc***");
    expect(JSON.stringify(a)).not.toContain("secret.txt");
  });

  it("extracts dependency package, advisories and fixed version; maps unknown values", () => {
    const a = normalizeAlert(
      {
        alertId: 1,
        alertType: "dependency",
        severity: "weird",
        state: "draft",
        title: "lodash vulnerable (CVE-2021-23337)",
        logicalLocations: [{ fullyQualifiedName: "pkg:npm/lodash@4.17.20", kind: "component" }],
        tools: [{ name: "DS", rules: [{ opaqueId: "GHSA-35JH-R3H4-6JHM", additionalProperties: { patchedVersion: "4.17.21" } }] }],
        isDevDependency: true,
      },
      "p",
      "r",
      "org",
    )!;
    expect(a).toMatchObject({ packageName: "lodash", packageVersion: "4.17.20", ecosystem: "npm", fixedVersion: "4.17.21", severity: "unknown", state: "unknown" });
    expect(a.advisoryIds).toEqual(["CVE-2021-23337", "GHSA-35jh-r3h4-6jhm"]);
  });

  it("rejects alerts without an id and maps aiCode to code", () => {
    expect(normalizeAlert({ alertType: "code" }, "p", "r", "o")).toBeNull();
    expect(normalizeAlert({ alertId: 2, alertType: "aiCode" }, "p", "r", "o")!.kind).toBe("code");
  });

  it("parses package forms", () => {
    expect(parsePackage("@scope/pkg@1.2.3")).toEqual({ name: "@scope/pkg", version: "1.2.3" });
    expect(parsePackage("Newtonsoft.Json 12.0.1")).toEqual({ name: "Newtonsoft.Json", version: "12.0.1" });
    expect(parsePackage("pkg:npm/%40scope/pkg@1.2.3?arch=x64#sub")).toEqual({ ecosystem: "npm", name: "@scope/pkg", version: "1.2.3" });
    expect(parsePackage("pkg:NuGet/Newtonsoft.Json")).toEqual({ ecosystem: "nuget", name: "Newtonsoft.Json", version: undefined });
  });

  it("parses adversarial package URLs in linear time", () => {
    const start = performance.now();
    parsePackage(`pkg:./a@${'"@"'.repeat(50_000)}`);
    parsePackage(`pkg:./a#${"a#".repeat(50_000)}`);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("dedupes branch occurrences keeping the most recently seen", () => {
    const base = normalizeAlert({ alertId: 3, alertType: "code", lastSeenDate: "2024-01-01T00:00:00Z", gitRef: "refs/heads/a" }, "p", "r", "o")!;
    const newer = { ...base, lastSeen: "2024-02-01T00:00:00.000Z", gitRef: "refs/heads/main" };
    expect(dedupeAlerts([base, newer])).toEqual([newer]);
  });
});
