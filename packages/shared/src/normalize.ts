import type { AlertKind, AlertState, NormalizedAlert, SecretValidity, Severity } from "./types.js";

/** Loosely typed subset of the Advanced Security alert contract; anything may be missing. */
export interface RawAlert {
  alertId?: number;
  alertType?: string;
  severity?: string;
  state?: string;
  title?: string;
  gitRef?: string;
  firstSeenDate?: string;
  lastSeenDate?: string;
  fixedDate?: string;
  introducedDate?: string;
  isDevDependency?: boolean | null;
  confidence?: string;
  additionalProperties?: Record<string, unknown>;
  logicalLocations?: { fullyQualifiedName?: string; kind?: string }[];
  tools?: { name?: string; rules?: RawRule[] }[];
  validityDetails?: { validityStatus?: string };
  dismissal?: {
    dismissalType?: string;
    stateChangedByIdentity?: { displayName?: string };
  };
  [key: string]: unknown;
}

interface RawRule {
  opaqueId?: string;
  friendlyName?: string;
  description?: string;
  additionalProperties?: Record<string, unknown>;
}

const MAX_TEXT = 256;
const DISMISSAL_REASONS = new Set(["fixed", "acceptedrisk", "falsepositive", "agreedtoguidance", "toolupgrade", "notdistributed"]);

export function normalizeKind(raw: string | undefined): AlertKind {
  switch ((raw ?? "").toLowerCase()) {
    case "code":
    case "aicode":
      return "code";
    case "dependency":
      return "dependency";
    case "secret":
      return "secret";
    default:
      return "other";
  }
}

export function normalizeSeverity(raw: string | undefined): Severity {
  switch ((raw ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "unknown";
  }
}

export function normalizeState(raw: string | undefined): AlertState {
  switch ((raw ?? "").toLowerCase()) {
    case "active":
      return "active";
    case "dismissed":
      return "dismissed";
    case "fixed":
      return "fixed";
    case "autodismissed":
      return "autoDismissed";
    default:
      return "unknown";
  }
}

function normalizeValidity(raw: string | undefined): SecretValidity | undefined {
  switch ((raw ?? "").toLowerCase()) {
    case "active":
      return "active";
    case "inactive":
      return "inactive";
    case "unknown":
      return "unknown";
    case "none":
      return "none";
    default:
      return undefined;
  }
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Strip control characters from untrusted alert text.
  // eslint-disable-next-line no-control-regex
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT - 1)}…` : trimmed;
}

function safeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

const ADVISORY_RE = /\b(CVE-\d{4}-\d{4,}|GHSA(?:-[23456789cfghjmpqrvwx]{4}){3})\b/gi;

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 3 || out.length > 50) return;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out, depth + 1));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out, depth + 1));
}

function findAdvisories(sources: unknown[]): string[] {
  const strings: string[] = [];
  sources.forEach((s) => collectStrings(s, strings));
  const ids = new Set<string>();
  for (const s of strings) {
    for (const m of s.matchAll(ADVISORY_RE)) {
      const id = m[1]!;
      ids.add(/^cve/i.test(id) ? id.toUpperCase() : `GHSA${id.slice(4).toLowerCase()}`);
    }
  }
  return [...ids].sort();
}

const FIXED_VERSION_KEY = /(patched|fixed|firstpatched|minimumfixed|fix)[_-]?version/i;

function findFixedVersion(sources: (Record<string, unknown> | undefined)[]): string | undefined {
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (FIXED_VERSION_KEY.test(k)) {
        const text = safeText(typeof v === "number" ? String(v) : v);
        if (text) return text;
      }
    }
  }
  return undefined;
}

/** Parses package URLs (pkg:type/namespace/name@version) and common "ecosystem/name/version" or "name version" forms. */
export function parsePackage(fqn: string): { name: string; version?: string; ecosystem?: string } {
  const value = fqn.trim();
  const purl = /^pkg:([^/]+)\/(.+?)(?:@([^?#]+))?(?:[?#].*)?$/i.exec(value);
  if (purl) {
    return { ecosystem: purl[1]!.toLowerCase(), name: decodeURIComponent(purl[2]!), version: purl[3] ? decodeURIComponent(purl[3]) : undefined };
  }
  const at = /^(@?[^@\s]+)@([^\s@]+)$/.exec(value);
  if (at) return { name: at[1]!, version: at[2]! };
  const spaced = /^(\S+)\s+(\S+)$/.exec(value);
  if (spaced) return { name: spaced[1]!, version: spaced[2]! };
  return { name: value };
}

/** Converts a raw API alert into allowlisted metadata. Unknown fields are dropped. */
export function normalizeAlert(raw: RawAlert, projectId: string, repositoryId: string, organization: string): NormalizedAlert | null {
  if (typeof raw.alertId !== "number" || !Number.isFinite(raw.alertId)) return null;
  const kind = normalizeKind(raw.alertType);
  const tool = raw.tools?.find((t) => t?.name);
  const rule = raw.tools?.flatMap((t) => t?.rules ?? []).find((r) => r && (r.opaqueId || r.friendlyName));
  const alert: NormalizedAlert = {
    key: `${organization.toLowerCase()}/${projectId}/${repositoryId}/${raw.alertId}`,
    alertId: raw.alertId,
    projectId,
    repositoryId,
    kind,
    rawType: safeText(raw.alertType) ?? "unknown",
    severity: normalizeSeverity(raw.severity),
    rawSeverity: safeText(raw.severity) ?? "unknown",
    state: normalizeState(raw.state),
    rawState: safeText(raw.state) ?? "unknown",
    title: safeText(raw.title) ?? `Alert ${raw.alertId}`,
    ruleId: safeText(rule?.opaqueId),
    ruleName: safeText(rule?.friendlyName),
    tool: safeText(tool?.name),
    gitRef: safeText(raw.gitRef),
    firstSeen: safeDate(raw.firstSeenDate),
    lastSeen: safeDate(raw.lastSeenDate),
    fixedDate: safeDate(raw.fixedDate),
    introducedDate: safeDate(raw.introducedDate),
  };

  if (kind === "dependency") {
    const component =
      raw.logicalLocations?.find((l) => /component|vulnerabledependency/i.test(l?.kind ?? "")) ?? raw.logicalLocations?.[0];
    if (component?.fullyQualifiedName) {
      const pkg = parsePackage(component.fullyQualifiedName);
      alert.packageName = safeText(pkg.name);
      alert.packageVersion = safeText(pkg.version);
      alert.ecosystem = safeText(pkg.ecosystem);
    }
    const advisories = findAdvisories([raw.title, rule?.opaqueId, rule?.friendlyName, rule?.additionalProperties, raw.additionalProperties]);
    if (advisories.length) alert.advisoryIds = advisories;
    alert.fixedVersion = findFixedVersion([raw.additionalProperties, rule?.additionalProperties]);
    if (typeof raw.isDevDependency === "boolean") alert.isDevDependency = raw.isDevDependency;
  }

  if (kind === "secret") {
    // Secret type comes from the rule label; truncatedSecret and fingerprints are deliberately never read.
    alert.secretType = safeText(rule?.friendlyName) ?? safeText(raw.title);
    alert.validity = normalizeValidity(raw.validityDetails?.validityStatus);
    alert.confidence = safeText(raw.confidence);
  }

  if (raw.dismissal && typeof raw.dismissal === "object") {
    const rawReason = raw.dismissal.dismissalType?.toLowerCase() ?? "unknown";
    alert.dismissal = {
      reason: DISMISSAL_REASONS.has(rawReason) ? rawReason : "unknown",
      actor: safeText(raw.dismissal.stateChangedByIdentity?.displayName),
    };
  }

  for (const k of Object.keys(alert) as (keyof NormalizedAlert)[]) {
    if (alert[k] === undefined) delete alert[k];
  }
  return alert;
}

/** Collapses branch occurrences: one logical alert per stable key, preferring the most recently seen record. */
export function dedupeAlerts(alerts: NormalizedAlert[]): NormalizedAlert[] {
  const byKey = new Map<string, NormalizedAlert>();
  for (const a of alerts) {
    const prev = byKey.get(a.key);
    if (!prev || (a.lastSeen ?? "") > (prev.lastSeen ?? "")) byKey.set(a.key, a);
  }
  return [...byKey.values()];
}
