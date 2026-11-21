import type { OAuth2Client } from "google-auth-library";
import { google, type groupssettings_v1 } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";
import { isKnownSetting, normaliseSettings, SETTING_NAMES } from "./group-settings-catalog.js";

export interface SettingsView {
  group: string;
  name?: string;
  description?: string;
  groups: Record<string, Record<string, unknown>>;
  other: Record<string, unknown>;
}

export interface UpdateResult {
  group: string;
  requested: Record<string, string | boolean | number>;
  previous: Record<string, unknown>;
  current: SettingsView;
}

/**
 * Groups Settings API. `groups.patch` exists and is the documented partial
 * update, so it is used instead of relying on PUT semantics to spare fields the
 * caller did not mention.
 */
export class GroupSettingsService {
  private readonly client: groupssettings_v1.Groupssettings;

  constructor(auth: OAuth2Client) {
    this.client = google.groupssettings({ version: "v1", auth });
  }

  async getSettings(groupEmail: string): Promise<SettingsView> {
    try {
      const response = await this.client.groups.get({ groupUniqueId: groupEmail });
      return toView(groupEmail, response.data as Record<string, unknown>);
    } catch (error) {
      throw mapGoogleError(error, "groups-settings");
    }
  }

  async updateSettings(
    groupEmail: string,
    settings: Record<string, string | boolean | number>,
  ): Promise<UpdateResult> {
    const names = Object.keys(settings);
    if (names.length === 0) {
      throw new ToolError(
        "invalid_request",
        "No settings were supplied to change.",
        "Pass at least one setting name with its new value.",
      );
    }

    const unknown = names.filter((name) => !isKnownSetting(name));
    if (unknown.length > 0) {
      throw new ToolError(
        "invalid_request",
        `Unknown setting${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`,
        `Accepted names: ${SETTING_NAMES.join(", ")}.`,
      );
    }

    const previous = await this.getSettings(groupEmail);
    const body: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(settings)) {
      // Boolean and text settings are string-valued in the API; the byte limit
      // is an integer and stays one.
      body[name] = typeof value === "number" ? value : String(value);
    }

    try {
      await this.client.groups.patch({ groupUniqueId: groupEmail, requestBody: body as never });
      const current = await this.getSettings(groupEmail);
      return { group: groupEmail, requested: settings, previous: previous.groups, current };
    } catch (error) {
      throw mapGoogleError(error, "groups-settings");
    }
  }
}

function toView(groupEmail: string, raw: Record<string, unknown>): SettingsView {
  const { groups, other } = normaliseSettings(raw);
  return {
    group: typeof raw.email === "string" ? raw.email : groupEmail,
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
    groups,
    other,
  };
}
