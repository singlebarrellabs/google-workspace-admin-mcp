import { z } from "zod";
import type { ToolSpec } from "../catalog.js";
import type { GroupSettingsService } from "../services/group-settings.js";

const getShape = {
  groupEmail: z.string().min(1).describe("Group address, for example team@example.com"),
};

const updateShape = {
  ...getShape,
  settings: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
    .describe(
      'Only the settings to change, for example {"whoCanPostMessage": "ALL_MEMBERS_CAN_POST"}',
    ),
};

export function groupSettingsTools(service: GroupSettingsService): ToolSpec[] {
  return [
    {
      name: "gws_group_settings_get",
      surface: "groups-settings",
      access: "read",
      edition: "all",
      description:
        "Read a group's settings, normalised into membership, posting, moderation and delivery. Unrecognised response fields land under `other` instead of being dropped.",
      inputShape: getShape,
      run: async (input) => {
        const args = z.object(getShape).parse(input);
        const view = await service.getSettings(args.groupEmail);
        const counts = Object.entries(view.groups)
          .map(([group, values]) => `${group} ${Object.keys(values).length}`)
          .join(", ");
        return { summary: `${view.group}: ${counts}`, data: view };
      },
    },
    {
      name: "gws_group_settings_update",
      surface: "groups-settings",
      access: "write",
      edition: "all",
      description:
        "Change named group settings. The request body carries only the settings supplied, because the API applies patch semantics; every other setting is left alone and the result shows what changed.",
      inputShape: updateShape,
      run: async (input) => {
        const args = z.object(updateShape).parse(input);
        const result = await service.updateSettings(args.groupEmail, args.settings);
        return {
          summary: `Updated ${Object.keys(args.settings).length} setting${
            Object.keys(args.settings).length === 1 ? "" : "s"
          } on ${args.groupEmail}`,
          data: result,
        };
      },
    },
  ];
}
