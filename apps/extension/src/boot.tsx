import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import { Surface, SurfaceBackground } from "azure-devops-ui/Surface";
import { initSdk, notifyLoaded } from "./sdk";
import "./theme";

/** Boots the SDK, renders the element returned by `build`, and reports load status to the host. */
export function boot(build: () => Promise<ReactNode>): void {
  const root = createRoot(document.getElementById("root")!);
  // No StrictMode: azure-devops-ui still uses legacy lifecycles that StrictMode flags in development.
  const shell = (node: ReactNode) => (
    <Surface background={SurfaceBackground.neutral}>
      <div className="app-root flex-column">{node}</div>
    </Surface>
  );
  root.render(shell(<Spinner className="app-loading" size={SpinnerSize.large} label="Loading Advanced Security data…" />));
  void initSdk()
    .then(build)
    .then((node) => root.render(shell(node)))
    .catch((err: Error) =>
      root.render(
        shell(
          <div className="page-body" style={{ paddingTop: 24 }}>
            <MessageCard severity={MessageCardSeverity.Error}>Failed to start: {err.message}</MessageCard>
          </div>,
        ),
      ),
    )
    .finally(notifyLoaded);
}
