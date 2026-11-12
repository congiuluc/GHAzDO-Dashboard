import type { AlertSummary } from "@ghazdo/shared";

export function groupAlertsByProject(alerts: AlertSummary[]): Map<string, AlertSummary[]> {
  const groups = new Map<string, AlertSummary[]>();
  for (const alert of alerts) {
    const group = groups.get(alert.projectId) ?? [];
    group.push(alert);
    groups.set(alert.projectId, group);
  }
  return groups;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function safeAlertUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function workItemDescription(alerts: AlertSummary[]): string {
  const list = alerts
    .map((alert) => {
      const title = escapeHtml(alert.title);
      const url = safeAlertUrl(alert.url);
      const link = url ? `<a href="${escapeHtml(url)}">${title}</a>` : title;
      return `<li>${link} — ${escapeHtml(alert.severity)} · ${escapeHtml(alert.kind)} · ${escapeHtml(alert.repositoryName)}</li>`;
    })
    .join("");
  return `<p>Created from the Advanced Security dashboard. Review and remediate the linked alerts:</p><ul>${list}</ul>`;
}
