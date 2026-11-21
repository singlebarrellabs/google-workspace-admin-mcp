import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../../catalog.js";
import { CHROMEOS_ACTIONS, type DevicesService, MOBILE_ACTIONS } from "../../services/devices.js";

const mobileListShape = {
  maxResults: z.number().int().min(1).max(100).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const chromeOsListShape = {
  maxResults: z.number().int().min(1).max(300).optional().describe("Page size, default 100"),
  pageToken: z.string().optional().describe("Token from a previous call"),
};

const mobileShape = {
  resourceId: z.string().min(1).describe("Resource id from a list call"),
};

const chromeOsShape = {
  deviceId: z.string().min(1).describe("Device id, serial or inventory id"),
};

const mobileActionShape = {
  ...mobileShape,
  action: z.enum(MOBILE_ACTIONS).describe("approve or block are reversible; wipes are not"),
  confirm: z.boolean().optional().describe("Must be true for any action that wipes the device"),
};

const chromeOsActionShape = {
  resourceId: z.string().min(1).describe("Resource id from a list call"),
  action: z
    .enum(CHROMEOS_ACTIONS)
    .describe("disable and reenable are reversible; deprovision is not"),
  deprovisionReason: z
    .string()
    .optional()
    .describe("Required when the action is deprovision; for example RETIRE or UPGRADE"),
  confirm: z.boolean().optional().describe("Must be true. Fleet actions change the device now"),
};

const REVERSIBLE_MOBILE = new Set<string>(["approve", "block"]);

export function deviceTools(service: DevicesService): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_devices_mobile_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List enrolled mobile devices with model, OS, status, owner and last sync.",
      inputShape: mobileListShape,
      run: async (input) => {
        const args = z.object(mobileListShape).parse(input);
        const result = await service.listMobileDevices(args);
        return {
          summary: `${result.items.length} device${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_devices_mobile_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one mobile device.",
      inputShape: mobileShape,
      run: async (input) => {
        const args = z.object(mobileShape).parse(input);
        const device = await service.getMobileDevice(args.resourceId);
        return {
          summary: `${device.model ?? "device"} ${device.status ?? ""}`.trim(),
          data: device,
        };
      },
    },
    {
      name: "gws_devices_mobile_action",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Approve, block or wipe a mobile device. block and approve are reversible; admin_remote_wipe erases company data and admin_account_wipe erases the whole account.",
      confirmNote: "the device's state changes now, and a wipe cannot be undone",
      inputShape: mobileActionShape,
      run: async (input) => {
        const args = z.object(mobileActionShape).parse(input);
        const result = await service.mobileAction(args.resourceId, args.action);
        return {
          summary: `${args.action} sent to ${args.resourceId}${REVERSIBLE_MOBILE.has(args.action) ? " (reversible)" : ""}`,
          data: result,
        };
      },
    },
    {
      name: "gws_devices_chromeos_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List ChromeOS devices with serial, model, status, org unit and annotated user.",
      inputShape: chromeOsListShape,
      run: async (input) => {
        const args = z.object(chromeOsListShape).parse(input);
        const result = await service.listChromeOsDevices(args);
        return {
          summary: `${result.items.length} device${result.items.length === 1 ? "" : "s"}${
            result.nextPageToken ? ", more available" : ""
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_devices_chromeos_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one ChromeOS device.",
      inputShape: chromeOsShape,
      run: async (input) => {
        const args = z.object(chromeOsShape).parse(input);
        const device = await service.getChromeOsDevice(args.deviceId);
        return {
          summary: `${device.model ?? "device"} ${device.status ?? ""}`.trim(),
          data: device,
        };
      },
    },
    {
      name: "gws_devices_chromeos_action",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Disable, reenable, powerwash or deprovision a ChromeOS device. Deprovisioning removes the device from management and cannot be undone from here.",
      confirmNote:
        "the fleet action takes effect now; deprovision removes the device from management",
      inputShape: chromeOsActionShape,
      run: async (input) => {
        const args = z.object(chromeOsActionShape).parse(input);
        const result = await service.chromeOsAction(
          args.resourceId,
          args.action,
          args.deprovisionReason,
        );
        return { summary: `${args.action} sent to ${args.resourceId}`, data: result };
      },
    },
  ];
}
