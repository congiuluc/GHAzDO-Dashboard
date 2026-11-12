import type { WidgetStatus, SaveStatus } from "azure-devops-extension-api/Dashboard";

/*
 * ESM equivalents of the runtime helpers in azure-devops-extension-api/Dashboard.
 * That package ships AMD modules (`define(...)`), which cannot run in a Vite bundle,
 * so only its types are imported. Values mirror WidgetHelpers.js / WidgetConfigHelpers.js.
 */

const WIDGET_STATUS_SUCCESS = 0;

export const WidgetStatusHelper = {
  Success: (state?: string): Promise<WidgetStatus> => Promise.resolve({ state, statusType: WIDGET_STATUS_SUCCESS } as WidgetStatus),
  Failure: (message: string, isUserVisible = true, isRichText = false): Promise<WidgetStatus> => Promise.reject({ message, isUserVisible, isRichText }),
};

export const WidgetConfigurationSave = {
  Valid: (customSettings: { data: string }): Promise<SaveStatus> => Promise.resolve({ customSettings, isValid: true } as SaveStatus),
  Invalid: (): Promise<SaveStatus> => Promise.reject({ isValid: false }),
};

export const ConfigurationEvent = {
  ConfigurationChange: "ms.vss-dashboards-web.configurationChange",
  ConfigurationError: "ms.vss-dashboards-web.configurationError",
  GeneralSettingsChanged: "ms.vss-dashboards-web.generalSettingsChanged",
  Args: <T>(data: T) => ({ data }),
};
