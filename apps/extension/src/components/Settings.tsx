import { useEffect, useState } from "react";
import { Button } from "azure-devops-ui/Button";
import { Card } from "azure-devops-ui/Card";
import { Checkbox } from "azure-devops-ui/Checkbox";
import { FormItem } from "azure-devops-ui/FormItem";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import { TextField, TextFieldWidth } from "azure-devops-ui/TextField";
import { Toggle } from "azure-devops-ui/Toggle";
import {
  MAX_HISTORY_DAYS,
  MIN_HISTORY_DAYS,
  SEVERITIES,
  parseSettings,
  validateBackendUrl,
  validateDigestRecipients,
  validateSlaDays,
  type DashboardSettings,
  type Severity,
} from "@ghazdo/shared";
import { backendFetch, testBackend } from "../data/backendSource";
import { BACKEND_ALLOWLIST, dataManager, getUserOptIn, isCollectionAdmin, saveSettings, setUserOptIn, type AppContext } from "../data/context";
import { UserHistorySync, type DocumentStore } from "../data/userHistory";
import { inHost } from "../sdk";

interface BackendSettings {
  maxHistoryDays: number;
  slaDays: DashboardSettings["slaDays"];
  digestRecipientCount: number;
  digestRecipients?: string[];
  emailConfigured: boolean;
}

export function SettingsPanel({ ctx }: { ctx: AppContext }) {
  const [admin, setAdmin] = useState<boolean>();
  const [draft, setDraft] = useState<DashboardSettings>(ctx.settings);
  const [optIn, setOptIn] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);
  const [digestConfig, setDigestConfig] = useState<{ digestRecipientCount: number; digestRecipients?: string[]; emailConfigured: boolean }>();

  useEffect(() => {
    void isCollectionAdmin(ctx.host).then(setAdmin);
    void getUserOptIn().then(setOptIn).catch(() => setOptIn(false));
  }, [ctx.host]);

  useEffect(() => {
    if (admin === undefined || !ctx.backendUrl) return;
    let active = true;
    void backendFetch<BackendSettings>(ctx.backendUrl, "config")
      .then((config) => {
        if (!active) return;
        setDigestConfig(config);
        if (admin && config.digestRecipients) {
          setDraft((current) => ({
            ...current,
            maxHistoryDays: config.maxHistoryDays,
            slaDays: config.slaDays,
            digestRecipients: config.digestRecipients ?? [],
          }));
        }
      })
      .catch((err) => {
        if (active) setStatus({ kind: "error", text: `Could not load shared backend settings: ${(err as Error).message}` });
      });
    return () => { active = false; };
  }, [admin, ctx.backendUrl]);

  const url = validateBackendUrl(draft.backendUrl, BACKEND_ALLOWLIST);
  const digestEditable = admin === true && !!ctx.backendUrl && url.ok && url.value === ctx.backendUrl;
  const daysValid = Number.isInteger(draft.maxHistoryDays) && draft.maxHistoryDays >= MIN_HISTORY_DAYS && draft.maxHistoryDays <= MAX_HISTORY_DAYS;
  const slaValidation = validateSlaDays(draft.slaDays);
  const slaValid = slaValidation.ok;
  const digestRecipients = validateDigestRecipients(draft.digestRecipients);
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
      if (!slaValidation.ok) throw new Error(slaValidation.error);
      if (!digestRecipients.ok) throw new Error(digestRecipients.error);
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
      <section className="grid-cell span-8" aria-label="Organization settings">
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
            <FormItem label="Remediation SLA (days)" message="An alert is overdue when its age exceeds the threshold. Set 0 to disable; defaults are critical 7, high 30 and medium 90 days.">
              <div className="settings-row">
                {SEVERITIES.map((severity) => (
                  <label key={severity} className="settings-sla-field">
                    <span>{severity}</span>
                    <TextField
                      inputId={`sla-${severity}`}
                      inputType="number"
                      value={String(draft.slaDays[severity] ?? 0)}
                      onChange={(_, value) => {
                        const days = value === "" ? 0 : Number(value);
                        const next = { ...draft.slaDays };
                        if (days > 0) next[severity as Severity] = days;
                        else delete next[severity as Severity];
                        setDraft({ ...draft, slaDays: next });
                      }}
                      ariaInvalid={!slaValid}
                      disabled={readOnly || busy}
                    />
                  </label>
                ))}
              </div>
            </FormItem>
            <FormItem
              label="Weekly digest recipients (optional)"
              error={digestEditable && !digestRecipients.ok}
              message={digestEditable
                ? digestRecipients.ok
                  ? digestConfig?.emailConfigured
                    ? "Comma-separated. Sends aggregate-only metrics every Monday at 09:00 UTC."
                    : "Recipients are stored securely, but email delivery is not configured. Configure Azure Communication Services email to enable delivery."
                  : digestRecipients.error
                : admin === true
                  ? "Save the shared backend URL and reload to configure digest recipients."
                  : `${digestConfig?.digestRecipientCount ?? 0} recipients configured. Only Project Collection Administrators can view or change recipient addresses.`}
            >
              {digestEditable && (
                <TextField
                  inputId="digestRecipients"
                  value={draft.digestRecipients.join(", ")}
                  onChange={(_, value) => setDraft({ ...draft, digestRecipients: value.split(",").map((email) => email.trim()).filter(Boolean) })}
                  ariaInvalid={!digestRecipients.ok}
                  disabled={readOnly || busy}
                />
              )}
            </FormItem>
            <div className="toolbar">
              <Button primary text="Save settings" onClick={() => void save()} disabled={readOnly || busy || !url.ok || !daysValid || !slaValid || !digestRecipients.ok} />
            </div>
            <p className="help">In browser-only mode these settings are stored as extension data. The admin check is enforced by this page; the backend enforces it server-side for its own configuration.</p>
          </div>
        </Card>
      </section>

      <section className="grid-cell span-4" aria-label="Your data">
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
