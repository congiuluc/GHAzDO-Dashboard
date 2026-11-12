import { EmailClient } from "@azure/communication-email";
import { aggregate, DEFAULT_FILTERS, retentionCutoffDay } from "@ghazdo/shared";
import type { BackendConfig } from "./config.js";
import { loadLatestSnapshots, type Store } from "./store.js";

export function weeklyDigestText(organization: string, data: ReturnType<typeof aggregate>, now = new Date()): string {
  const topProjects = data.topProjects.slice(0, 5).map((p) => `  - ${p.label}: ${p.count} open alerts (risk score ${p.extra?.score})`);
  return [
    `Advanced Security weekly digest for ${organization}`,
    `Generated ${now.toISOString()}`,
    "",
    `Open alerts: ${data.kpis.open}`,
    `Critical and high open: ${data.kpis.criticalHighOpen}`,
    `SLA overdue: ${data.sla.overdue}`,
    `New in the last 7 days: ${data.kpis.new7d}`,
    `Fixed in the last 7 days: ${data.kpis.fixed7d}`,
    "",
    "Highest-risk projects:",
    ...(topProjects.length ? topProjects : ["  - No project-level alerts"]),
  ].join("\n");
}

/** Sends only aggregate security metrics; alert titles, secret metadata and user names are excluded. */
export async function sendWeeklyDigest(
  store: Store,
  config: Pick<BackendConfig, "organization" | "emailConnectionString" | "emailSenderAddress">,
  now = new Date(),
): Promise<"skipped" | "sent"> {
  const settings = await store.getConfig();
  const recipients = settings.digestRecipients ?? [];
  if (!recipients.length) return "skipped";
  if (!config.emailConnectionString || !config.emailSenderAddress) {
    throw new Error("Digest recipients are configured, but Azure Communication Services email is not configured.");
  }
  const states = await store.listRepoStates();
  const snapshots = await loadLatestSnapshots(store, states);
  const observations = await store.listObservations(retentionCutoffDay(settings.maxHistoryDays, now));
  const data = aggregate({
    organization: config.organization,
    snapshots,
    observations,
    filters: { ...DEFAULT_FILTERS, periodDays: Math.min(7, settings.maxHistoryDays) },
    scope: { kind: "organization" },
    slaDays: settings.slaDays,
    now,
  });
  const text = weeklyDigestText(config.organization, data, now);
  const poller = await new EmailClient(config.emailConnectionString).beginSend({
    senderAddress: config.emailSenderAddress,
    recipients: { to: recipients.map((address) => ({ address })) },
    content: {
      subject: `Advanced Security weekly digest — ${config.organization}`,
      plainText: text,
    },
  });
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") throw new Error(`Digest email failed with status ${result.status}.`);
  return "sent";
}
