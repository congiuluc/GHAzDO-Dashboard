import { useEffect, useState } from "react";
import { Button } from "azure-devops-ui/Button";
import { Card } from "azure-devops-ui/Card";
import { Checkbox } from "azure-devops-ui/Checkbox";
import { FormItem } from "azure-devops-ui/FormItem";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import { TextField, TextFieldWidth } from "azure-devops-ui/TextField";
import { Toggle } from "azure-devops-ui/Toggle";
import { MAX_HISTORY_DAYS, MIN_HISTORY_DAYS, parseSettings, validateBackendUrl, type DashboardSettings } from "@ghazdo/shared";
import { testBackend } from "../data/backendSource";
import { BACKEND_ALLOWLIST, dataManager, getUserOptIn, isCollectionAdmin, saveSettings, setUserOptIn, type AppContext } from "../data/context";
import { UserHistorySync, type DocumentStore } from "../data/userHistory";
import { inHost } from "../sdk";

export function SettingsPanel({ ctx }: { ctx: AppContext }) {
  const [admin, setAdmin] = useState<boolean>();
  const [draft, setDraft] = useState<DashboardSettings>(ctx.settings);
  const [optIn, setOptIn] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void isCollectionAdmin(ctx.host).then(setAdmin);
    void getUserOptIn().then(setOptIn).catch(() => setOptIn(false));
  }, [ctx.host]);

  const url = validateBackendUrl(draft.backendUrl, BACKEND_ALLOWLIST);
  const daysValid = Number.isInteger(draft.maxHistoryDays) && draft.maxHistoryDays >= MIN_HISTORY_DAYS && draft.maxHistoryDays <= MAX_HISTORY_DAYS;
  const readOnly = admin !== true;

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setStatus(undefined);
    try {
      setStatus({ kind: "info", text: await action() });
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (!inHost) return "Settings are not saved outside Azure DevOps.";
      await saveSettings(parseSettings(draft));
      return "Settings saved. Reload the page to apply them.";
    });

  const test = () =>
    run(async () => {
      if (!url.ok || !url.value) throw new Error(url.ok ? "Enter a backend URL first." : url.error);
      const r = await testBackend(url.value);
      if (!r.ok) throw new Error(r.message);
      return r.message;
    });

  const toggleOptIn = (value: boolean) =>
    run(async () => {
      await setUserOptIn(value);
      setOptIn(value);
      return value ? "Your history will be saved to your Azure DevOps profile after the next collection." : "History sync turned off. Existing saved history is kept until you delete it.";
    });

  const purge = () =>
    run(async () => {
      if (!confirm("Delete the data cached in this browser and the history saved to your Azure DevOps profile?")) return "Nothing deleted.";
      await ctx.cache?.clear();
      if (inHost) await new UserHistorySync((await dataManager()) as unknown as DocumentStore, ctx.host.organization).purgeBefore("9999-12-31");
      return "Your cached data and saved history were deleted.";
    });

  return (
    <div className="grid">
      <section className="grid-cell span-8">
        <Card className="flex-grow" titleProps={{ text: "Organization settings", ariaLevel: 2 }}>
          <div className="settings-form flex-grow">
            {admin === undefined && <Spinner size={SpinnerSize.small} label="Checking permissions…" />}
            {admin === false && <MessageCard severity={MessageCardSeverity.Warning}>Only Project Collection Administrators can change these settings.</MessageCard>}
            <FormItem
              label="Shared backend URL (optional)"
              error={!url.ok}
              message={url.ok ? "Leave empty to collect in each user's browser. With a backend, organization-wide history is shared and stored in Azure." : url.error}
            >
              <div className="settings-row">
                <TextField
                  className="flex-grow"
                  inputId="backendUrl"
                  placeholder="https://your-function-app.azurewebsites.net"
                  value={draft.backendUrl}
                  onChange={(_, v) => setDraft({ ...draft, backendUrl: v })}
                  ariaInvalid={!url.ok}
                  disabled={readOnly || busy}
                />
                <Button text="Test connection" onClick={() => void test()} disabled={readOnly || busy || !url.ok || !url.value} />
              </div>
            </FormItem>
            <FormItem
              label="History to keep (days)"
              error={!daysValid}
              message={daysValid ? "Older observations are deleted. Applies to the backend, browser caches and saved user history." : `Enter a whole number from ${MIN_HISTORY_DAYS} to ${MAX_HISTORY_DAYS}.`}
            >
              <TextField
                inputId="days"
                inputType="number"
                width={TextFieldWidth.standard}
                value={String(draft.maxHistoryDays)}
                onChange={(_, v) => setDraft({ ...draft, maxHistoryDays: Number(v) })}
                ariaInvalid={!daysValid}
                disabled={readOnly || busy}
              />
            </FormItem>
            <FormItem message="Browser-only mode. Each user's history is private and only contains what their own permissions can see.">
              <Checkbox
                label="Let users save their history to their Azure DevOps profile"
                checked={draft.allowUserHistoryInAdo}
                onChange={(_, checked) => setDraft({ ...draft, allowUserHistoryInAdo: !!checked })}
                disabled={readOnly || busy}
              />
            </FormItem>
            <div className="toolbar">
              <Button primary text="Save settings" onClick={() => void save()} disabled={readOnly || busy || !url.ok || !daysValid} />
            </div>
            <p className="help">In browser-only mode these settings are stored as extension data. The admin check is enforced by this page; the backend enforces it server-side for its own configuration.</p>
          </div>
        </Card>
      </section>

      <section className="grid-cell span-4">
        <Card className="flex-grow" titleProps={{ text: "Your data", ariaLevel: 2 }}>
          {ctx.source.mode === "backend" ? (
            <p className="secondary-text">This organization uses a shared backend. Nothing is stored in your browser.</p>
          ) : (
            <div className="settings-form flex-grow">
              <FormItem message={ctx.settings.allowUserHistoryInAdo ? "Keeps your trends when you switch browsers. Your browser stays the cache." : "An administrator has not enabled this option."}>
                <Toggle text="Save my history to my Azure DevOps profile" checked={optIn} disabled={!ctx.settings.allowUserHistoryInAdo || busy} onChange={(_, v) => void toggleOptIn(v)} />
              </FormItem>
              <div className="toolbar">
                <Button danger iconProps={{ iconName: "Delete" }} text="Delete my cached data and history" onClick={() => void purge()} disabled={busy} />
              </div>
            </div>
          )}
        </Card>
      </section>

      {status && (
        <div className="span-12" role="status">
          <MessageCard severity={status.kind === "error" ? MessageCardSeverity.Error : MessageCardSeverity.Info} onDismiss={() => setStatus(undefined)}>
            {status.text}
          </MessageCard>
        </div>
      )}
    </div>
  );
}
