import { describe, expect, it } from "vitest";
import manifest from "../vss-extension.json";

describe("extension navigation", () => {
  it("adds the organization dashboard to Organization settings without changing the existing hub", () => {
    const organizationHub = manifest.contributions.find((contribution) => contribution.id === "ghazdo-hub");
    const settingsHub = manifest.contributions.find((contribution) => contribution.targets.includes("ms.vss-web.collection-admin-hub-group"));

    expect(settingsHub).toMatchObject({
      id: "ghazdo-org-settings-hub",
      type: "ms.vss-web.hub",
      properties: { uri: "dist/hub.html" },
    });
    expect(settingsHub?.properties.uri).toBe(organizationHub?.properties.uri);
    expect(organizationHub?.targets).toContain(".ghazdo-hub-group");
  });
});
