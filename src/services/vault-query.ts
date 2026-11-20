import type { vault_v1 } from "googleapis";
import { ToolError } from "../util/errors.js";

export type Corpus =
  | "MAIL"
  | "DRIVE"
  | "GROUPS"
  | "HANGOUTS_CHAT"
  | "VOICE"
  | "CALENDAR"
  | "GEMINI"
  | "GEMINI_IN_WORKSPACE";

export const CORPORA: Corpus[] = [
  "MAIL",
  "DRIVE",
  "GROUPS",
  "HANGOUTS_CHAT",
  "VOICE",
  "CALENDAR",
  "GEMINI",
  "GEMINI_IN_WORKSPACE",
];

export interface ExportQueryInput {
  corpus: Corpus;
  terms?: string;
  dataScope?: "ALL_DATA" | "HELD_DATA" | "UNPROCESSED_DATA";
  method?:
    | "ACCOUNT"
    | "ORG_UNIT"
    | "TEAM_DRIVE"
    | "ENTIRE_ORG"
    | "ROOM"
    | "SITES_URL"
    | "SHARED_DRIVE"
    | "DRIVE_DOCUMENT";
  accountEmails?: string[];
  orgUnitId?: string;
  sharedDriveId?: string;
  startTime?: string;
  endTime?: string;
  timeZone?: string;
  options?: Record<string, unknown>;
}

const SHORTCUT_KEYS = [
  "corpus",
  "terms",
  "dataScope",
  "method",
  "searchMethod",
  "accountInfo",
  "orgUnitInfo",
  "sharedDriveInfo",
  "startTime",
  "endTime",
  "timeZone",
];

/**
 * Builds the `Query` body shared by saved queries and exports. A search method
 * that needs an entity is derived from the entity itself, so a caller cannot
 * send ACCOUNT with no accounts and get a confusing API error back.
 */
export function buildQuery(input: ExportQueryInput): vault_v1.Schema$Query {
  const scopes = [
    input.accountEmails?.length ? "accountEmails" : "",
    input.orgUnitId ? "orgUnitId" : "",
    input.sharedDriveId ? "sharedDriveId" : "",
  ].filter(Boolean);

  if (scopes.length > 1) {
    throw new ToolError(
      "invalid_request",
      `A query searches one entity: ${scopes.join(", ")} were all supplied.`,
      "Keep exactly one of accountEmails, orgUnitId or sharedDriveId.",
    );
  }

  const derivedMethod = input.accountEmails?.length
    ? "ACCOUNT"
    : input.orgUnitId
      ? "ORG_UNIT"
      : input.sharedDriveId
        ? "SHARED_DRIVE"
        : undefined;

  if (input.method && derivedMethod && input.method !== derivedMethod) {
    throw new ToolError(
      "invalid_request",
      `method is ${input.method}, but the supplied entity makes it ${derivedMethod}.`,
      "Drop method and let it be derived, or match it to the entity you supplied.",
    );
  }

  const method = input.method ?? derivedMethod;
  requireEntityForMethod(method, input);

  const base: Record<string, unknown> = {
    corpus: input.corpus,
    ...(input.terms ? { terms: input.terms } : {}),
    ...(input.dataScope ? { dataScope: input.dataScope } : {}),
    ...(method ? { method } : {}),
    ...(input.accountEmails?.length ? { accountInfo: { emails: input.accountEmails } } : {}),
    ...(input.orgUnitId ? { orgUnitInfo: { orgUnitId: input.orgUnitId } } : {}),
    ...(input.sharedDriveId ? { sharedDriveInfo: { sharedDriveId: input.sharedDriveId } } : {}),
    ...(input.startTime ? { startTime: input.startTime } : {}),
    ...(input.endTime ? { endTime: input.endTime } : {}),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
  };

  return mergeOptions(base, input.options) as vault_v1.Schema$Query;
}

function requireEntityForMethod(method: string | undefined, input: ExportQueryInput): void {
  if (method === "ACCOUNT" && !input.accountEmails?.length) {
    throw new ToolError(
      "invalid_request",
      "method ACCOUNT needs accountEmails.",
      "Supply accountEmails, or choose a different method.",
    );
  }
  if (method === "ORG_UNIT" && !input.orgUnitId) {
    throw new ToolError(
      "invalid_request",
      "method ORG_UNIT needs orgUnitId.",
      "Supply orgUnitId, or choose a different method.",
    );
  }
  if (method === "SHARED_DRIVE" && !input.sharedDriveId) {
    throw new ToolError(
      "invalid_request",
      "method SHARED_DRIVE needs sharedDriveId.",
      "Supply sharedDriveId, or choose a different method.",
    );
  }
  if (method === "TEAM_DRIVE" || method === "SITES_URL" || method === "DRIVE_DOCUMENT") {
    throw new ToolError(
      "invalid_request",
      `method ${method} needs options this shortcut does not model.`,
      "Pass the whole entity through the raw query body instead.",
    );
  }
}

export interface HoldQueryInput {
  terms?: string;
  startTime?: string;
  endTime?: string;
  includeRooms?: boolean;
  includeSharedDriveFiles?: boolean;
  coveredData?: Array<"VOICE_TEXT" | "VOICE_AUDIO">;
  /** Raw CorpusQuery, for options the shortcuts do not model. */
  query?: Record<string, unknown>;
}

const HOLD_SHORTCUTS = [
  "terms",
  "startTime",
  "endTime",
  "includeRooms",
  "includeSharedDriveFiles",
  "coveredData",
];

/**
 * Builds the hold's `CorpusQuery`. Each corpus accepts a different shape, and
 * the API silently ignores a query that does not match its corpus, so a
 * shortcut that does not apply is refused rather than dropped.
 */
export function buildHoldQuery(corpus: Corpus, input: HoldQueryInput): vault_v1.Schema$CorpusQuery {
  const supplied = HOLD_SHORTCUTS.filter(
    (key) => (input as Record<string, unknown>)[key] !== undefined,
  );

  if (input.query) {
    if (supplied.length > 0) {
      throw new ToolError(
        "invalid_request",
        `Pass either query or the shortcut fields, not both: ${supplied.join(", ")} were supplied with a raw query.`,
        "Use the raw query alone when you need options the shortcuts do not cover.",
      );
    }
    return input.query as vault_v1.Schema$CorpusQuery;
  }

  switch (corpus) {
    case "MAIL":
      allow(supplied, ["terms", "startTime", "endTime"], corpus);
      return {
        mailQuery: {
          ...(input.terms ? { terms: input.terms } : {}),
          ...(input.startTime ? { startTime: input.startTime } : {}),
          ...(input.endTime ? { endTime: input.endTime } : {}),
        },
      };
    case "GROUPS":
      allow(supplied, ["terms", "startTime", "endTime"], corpus);
      return {
        groupsQuery: {
          ...(input.terms ? { terms: input.terms } : {}),
          ...(input.startTime ? { startTime: input.startTime } : {}),
          ...(input.endTime ? { endTime: input.endTime } : {}),
        },
      };
    case "HANGOUTS_CHAT":
      allow(supplied, ["includeRooms"], corpus);
      return {
        hangoutsChatQuery: {
          ...(input.includeRooms === undefined ? {} : { includeRooms: input.includeRooms }),
        },
      };
    case "VOICE":
      allow(supplied, ["coveredData"], corpus);
      if (!input.coveredData?.length) {
        throw new ToolError(
          "invalid_request",
          "A Voice hold needs coveredData.",
          "Pass coveredData with VOICE_TEXT, VOICE_AUDIO, or both.",
        );
      }
      return { voiceQuery: { coveredData: input.coveredData } };
    case "DRIVE":
      allow(supplied, ["includeSharedDriveFiles"], corpus);
      return {
        driveQuery: {
          ...(input.includeSharedDriveFiles === undefined
            ? {}
            : { includeSharedDriveFiles: input.includeSharedDriveFiles }),
        },
      };
    case "CALENDAR":
      allow(supplied, [], corpus);
      return { calendarQuery: {} };
    case "GEMINI":
      allow(supplied, [], corpus);
      return { geminiQuery: {} };
    case "GEMINI_IN_WORKSPACE":
      throw new ToolError(
        "invalid_request",
        "Holds do not support the GEMINI_IN_WORKSPACE corpus query.",
        "Use the GEMINI corpus for a Gemini app hold.",
      );
  }
}

function allow(supplied: string[], supported: string[], corpus: Corpus): void {
  const unsupported = supplied.filter((key) => !supported.includes(key));
  if (unsupported.length === 0) return;
  throw new ToolError(
    "invalid_request",
    `${unsupported.join(", ")} ${unsupported.length === 1 ? "does" : "do"} not apply to a ${corpus} hold.`,
    supported.length === 0
      ? `A ${corpus} hold takes no query options; drop them.`
      : `Supported for ${corpus}: ${supported.join(", ")}.`,
  );
}

export interface HoldScopeInput {
  corpus: Corpus;
  accountEmails?: string[];
  orgUnitId?: string;
}

/** A hold covers accounts or one org unit, never both. */
export function buildHoldScope(input: HoldScopeInput): vault_v1.Schema$Hold {
  if (input.accountEmails?.length && input.orgUnitId) {
    throw new ToolError(
      "invalid_request",
      "A hold covers either accounts or an organizational unit, not both.",
      "Keep accountEmails or orgUnitId.",
    );
  }

  if (!input.accountEmails?.length && !input.orgUnitId) {
    throw new ToolError(
      "invalid_request",
      "A hold needs accounts or an organizational unit.",
      "Pass accountEmails, or orgUnitId.",
    );
  }

  if (input.corpus === "GROUPS" && input.orgUnitId) {
    throw new ToolError(
      "invalid_request",
      "A Groups hold covers accounts; an organizational unit is not supported.",
      "Pass accountEmails instead of orgUnitId.",
    );
  }

  return {
    ...(input.accountEmails?.length
      ? { accounts: input.accountEmails.map((email) => ({ email })) }
      : {}),
    ...(input.orgUnitId ? { orgUnit: { orgUnitId: input.orgUnitId } } : {}),
  };
}

const EXPORT_FORMAT_BY_CORPUS: Partial<Record<Corpus, string>> = {
  MAIL: "mailOptions",
  GROUPS: "groupsOptions",
  HANGOUTS_CHAT: "hangoutsChatOptions",
  VOICE: "voiceOptions",
  CALENDAR: "calendarOptions",
  GEMINI: "geminiOptions",
};

export interface ExportOptionsInput {
  corpus: Corpus;
  exportFormat?: string;
  region?: "ANY" | "US" | "EUROPE";
  options?: Record<string, unknown>;
}

/**
 * Builds `ExportOptions`. The format lives under a per-corpus key; a corpus
 * without one (Drive) is told so rather than having the format dropped.
 */
export function buildExportOptions(input: ExportOptionsInput): vault_v1.Schema$ExportOptions {
  const base: Record<string, unknown> = {
    ...(input.region ? { region: input.region } : {}),
  };

  if (input.exportFormat) {
    const key = EXPORT_FORMAT_BY_CORPUS[input.corpus];
    if (!key) {
      throw new ToolError(
        "invalid_request",
        `A ${input.corpus} export has no exportFormat option.`,
        "Drop exportFormat, or set the corpus-specific option in options.",
      );
    }
    base[key] = { exportFormat: input.exportFormat };
  }

  return mergeOptions(base, input.options) as vault_v1.Schema$ExportOptions;
}

/**
 * Raw options may add what the shortcuts do not model, but they may not
 * silently overwrite a value that was derived from another argument.
 */
function mergeOptions(
  base: Record<string, unknown>,
  options: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!options) return base;

  const clashes = Object.keys(options).filter((key) => key in base);
  if (clashes.length > 0) {
    throw new ToolError(
      "invalid_request",
      `options sets ${clashes.join(", ")}, which another argument already sets.`,
      "Remove the duplicate from options, or use options alone.",
    );
  }

  return { ...base, ...options };
}

export { HOLD_SHORTCUTS, SHORTCUT_KEYS };
