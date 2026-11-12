// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../vss-extension.json";

const sdk = vi.hoisted(() => ({
  init: vi.fn().mockResolvedValue(undefined),
  ready: vi.fn().mockResolvedValue(undefined),
  getContributionId: vi.fn(),
  getExtensionContext: vi.fn(),
  register: vi.fn(),
  notifyLoadSucceeded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("azure-devops-extension-sdk", () => sdk);
vi.mock("../src/data/context", () => ({ createContext: vi.fn() }));
vi.mock("../src/theme", () => ({}));
vi.mock("../src/components/FilterBar", () => ({ MultiSelect: vi.fn(), SingleSelect: vi.fn() }));
vi.mock("../src/widgets/WidgetView", () => ({ WidgetView: vi.fn() }));
vi.mock("azure-devops-ui/FormItem", () => ({ FormItem: vi.fn() }));
vi.mock("azure-devops-ui/MessageCard", () => ({ MessageCard: vi.fn(), MessageCardSeverity: { Error: 0 } }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: vi.fn() }) }));

const extensionId = `${manifest.publisher}.${manifest.id}`;
const configuration = manifest.contributions.find((item) => item.type === "ms.vss-dashboards-web.widget-configuration")!;
const widgets = manifest.contributions.filter((item) => item.type === "ms.vss-dashboards-web.widget");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("parent", {});
  document.body.innerHTML = '<div id="root"></div>';
  sdk.getExtensionContext.mockReturnValue({ id: extensionId });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard contribution registration", () => {
  it("registers the configuration under the object id requested by the dashboard host", async () => {
    sdk.getContributionId.mockReturnValue(`${extensionId}.${configuration.id}`);

    await import("../src/widgets/config");
    await vi.waitFor(() => expect(sdk.notifyLoadSucceeded).toHaveBeenCalledOnce());

    expect(sdk.register).toHaveBeenCalledExactlyOnceWith(configuration.id, expect.objectContaining({
      load: expect.any(Function),
      onSave: expect.any(Function),
    }));
    expect(sdk.register.mock.invocationCallOrder[0]).toBeLessThan(sdk.notifyLoadSucceeded.mock.invocationCallOrder[0]!);
  });

  it.each(widgets)("registers $id under its manifest-local object id", async ({ id, targets }) => {
    sdk.getContributionId.mockReturnValue(`${extensionId}.${id}`);

    await import("../src/widgets/widget");
    await vi.waitFor(() => expect(sdk.notifyLoadSucceeded).toHaveBeenCalledOnce());

    expect(targets).toContain(`.${configuration.id}`);
    expect(sdk.register).toHaveBeenCalledExactlyOnceWith(id, expect.objectContaining({
      load: expect.any(Function),
      reload: expect.any(Function),
    }));
    expect(sdk.register.mock.invocationCallOrder[0]).toBeLessThan(sdk.notifyLoadSucceeded.mock.invocationCallOrder[0]!);
  });
});
