import {
  type GetLocationInfoNodeExecutionRequest,
  type GetLocationInfoNodeExecutionResult,
  type GetLocationInfoNodeInput,
  type GetLocationInfoNodeType,
  type WebAigcCoarseLocationInput,
  type WebAigcLocationAuthorizationStatus,
  WEB_AIGC_LOCATION_AUTHORIZATION_STATUSES,
} from "../../../shared/web-aigc-location-info.js";

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function isSupportedAuthorizationStatus(
  value: unknown,
): value is WebAigcLocationAuthorizationStatus {
  return (
    typeof value === "string" &&
    (WEB_AIGC_LOCATION_AUTHORIZATION_STATUSES as readonly string[]).includes(value)
  );
}

function normalizeAuthorizationStatus(
  value: unknown,
): WebAigcLocationAuthorizationStatus {
  if (isSupportedAuthorizationStatus(value)) {
    return value;
  }
  return "not_requested";
}

function normalizeGrantedBy(
  value: unknown,
): "user" | "workspace_admin" | "system" | undefined {
  return value === "user" || value === "workspace_admin" || value === "system"
    ? value
    : undefined;
}

function normalizeRetention(
  value: unknown,
): "ephemeral" | "session" | "workflow" {
  return value === "session" || value === "workflow" ? value : "ephemeral";
}

function normalizeBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRequestedPrecision(
  value: unknown,
): "coarse" | "precise" {
  return value === "precise" ? "precise" : "coarse";
}

function normalizeLocale(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  try {
    return Intl.getCanonicalLocales(normalized)[0];
  } catch {
    return normalized;
  }
}

function normalizeTimezone(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: normalized });
    return normalized;
  } catch {
    return undefined;
  }
}

function normalizeCountryCode(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  const upper = normalized.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : undefined;
}

function normalizeCoarseLocation(
  value: unknown,
): WebAigcCoarseLocationInput | undefined {
  const record = normalizeRecord(value);
  const countryCode = normalizeCountryCode(record.countryCode);
  const region = normalizeString(record.region);
  const city = normalizeString(record.city);
  const district = normalizeString(record.district);
  const source =
    record.source === "user_profile" ||
    record.source === "browser_hint" ||
    record.source === "manual_override" ||
    record.source === "system_default"
      ? record.source
      : undefined;

  if (!countryCode && !region && !city && !district && !source) {
    return undefined;
  }

  return {
    ...(countryCode ? { countryCode } : {}),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    ...(district ? { district } : {}),
    ...(source ? { source } : {}),
  };
}

function buildCoarseLocationLabel(
  location: WebAigcCoarseLocationInput | undefined,
): string | undefined {
  if (!location) {
    return undefined;
  }

  const segments = [
    normalizeString(location.city),
    normalizeString(location.region),
    normalizeCountryCode(location.countryCode),
  ].filter((segment): segment is string => Boolean(segment));

  return segments.length > 0 ? segments.join(", ") : undefined;
}

function buildNormalizedLocationPayload(
  input: GetLocationInfoNodeInput,
  warnings: string[],
): GetLocationInfoNodeExecutionResult["output"]["location"] {
  const privacy = normalizeRecord(input.privacy);
  const allowCoarseLocation = normalizeBoolean(privacy.allowCoarseLocation, true);
  const allowTimezone = normalizeBoolean(privacy.allowTimezone, true);
  const allowLocale = normalizeBoolean(privacy.allowLocale, true);
  const coarseLocation = normalizeCoarseLocation(input.coarseLocation);
  const timezone = normalizeTimezone(input.timezone);
  const locale = normalizeLocale(input.locale);

  if (!timezone && normalizeString(input.timezone)) {
    warnings.push("timezone was ignored because it was not a valid IANA timezone.");
  }

  const label = buildCoarseLocationLabel(coarseLocation);

  return {
    ...(allowCoarseLocation && coarseLocation
      ? {
          coarseLocation: {
            ...coarseLocation,
            ...(label ? { label } : {}),
          },
        }
      : {}),
    ...(allowTimezone && timezone ? { timezone } : {}),
    ...(allowLocale && locale ? { locale } : {}),
  };
}

function buildAuthorizationSummary(
  input: GetLocationInfoNodeInput,
): GetLocationInfoNodeExecutionResult["output"]["authorization"] {
  const authorization = normalizeRecord(input.authorization);
  const status = normalizeAuthorizationStatus(authorization.status);

  return {
    status,
    granted: status === "granted",
    ...(normalizeGrantedBy(authorization.grantedBy)
      ? { grantedBy: normalizeGrantedBy(authorization.grantedBy) }
      : {}),
    ...(normalizeString(authorization.disclosureText)
      ? { disclosureText: normalizeString(authorization.disclosureText) }
      : {}),
  };
}

function buildPrivacySummary(
  input: GetLocationInfoNodeInput,
  location: GetLocationInfoNodeExecutionResult["output"]["location"],
): GetLocationInfoNodeExecutionResult["output"]["privacy"] {
  const privacy = normalizeRecord(input.privacy);
  const requestedPrecision = normalizeRequestedPrecision(input.requestedPrecision);
  const deniedFields = ["latitude", "longitude", "accuracyMeters"];
  const notes = [
    "Only caller-supplied coarse location, timezone, and locale are accepted.",
    "Exact coordinates are not collected, stored, or returned by this adapter.",
  ];

  if (requestedPrecision === "precise") {
    notes.push("Precise location requests are downgraded to coarse-only output.");
  }

  if (!location.coarseLocation) {
    notes.push("No coarse location was returned after privacy filtering.");
  }
  if (!location.timezone) {
    notes.push("No timezone was returned after validation or privacy filtering.");
  }
  if (!location.locale) {
    notes.push("No locale was returned after validation or privacy filtering.");
  }

  return {
    precisionLevel: requestedPrecision === "precise" ? "precise_blocked" : "coarse",
    dataMinimization: "coarse_only",
    exactCoordinatesStored: false,
    exactCoordinatesAllowed: false,
    deniedFields,
    retention: normalizeRetention(privacy.retention),
    notes,
  };
}

export function isGetLocationInfoNodeType(
  value: unknown,
): value is GetLocationInfoNodeType {
  return value === "get_location_info";
}

export async function executeGetLocationInfoNode(
  request: GetLocationInfoNodeExecutionRequest,
): Promise<GetLocationInfoNodeExecutionResult> {
  if (!isGetLocationInfoNodeType(request.nodeType)) {
    throw new Error("Unsupported get_location_info node type.");
  }

  const input = request.input ?? {};
  const warnings: string[] = [];
  const context = normalizeRecord(input.context);
  const location = buildNormalizedLocationPayload(input, warnings);
  const authorization = buildAuthorizationSummary(input);
  const privacy = buildPrivacySummary(input, location);

  if (authorization.status !== "granted") {
    warnings.push(
      "Authorization was not granted; output is limited to explicitly provided coarse fields only.",
    );
  }

  if (privacy.precisionLevel === "precise_blocked") {
    warnings.push("Precise location access was blocked and reduced to coarse-only output.");
  }

  return {
    ok: true,
    nodeType: "get_location_info",
    output: {
      status: "completed",
      location,
      authorization,
      privacy,
      context,
      warnings,
    },
  };
}
