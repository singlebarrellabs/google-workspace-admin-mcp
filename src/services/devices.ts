import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export const MOBILE_ACTIONS = [
  "admin_remote_wipe",
  "admin_account_wipe",
  "approve",
  "block",
  "cancel_remote_wipe_then_activate",
  "cancel_remote_wipe_then_block",
] as const;

export const CHROMEOS_ACTIONS = [
  "deprovision",
  "disable",
  "reenable",
  "remote_powerwash",
  "remote_deprovision",
] as const;

export interface MobileDeviceRow {
  resourceId?: string;
  deviceId?: string;
  model?: string;
  os?: string;
  type?: string;
  status?: string;
  email?: string[];
  lastSync?: string;
}

export interface ChromeOsDeviceRow {
  deviceId?: string;
  serialNumber?: string;
  model?: string;
  status?: string;
  orgUnitPath?: string;
  annotatedUser?: string;
  lastSync?: string;
}

export interface ListDevicesArgs {
  maxResults?: number;
  pageToken?: string;
}

/** Mobile and ChromeOS device inventory plus the fleet actions. */
export class DevicesService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listMobileDevices(
    args: ListDevicesArgs,
  ): Promise<{ items: MobileDeviceRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.mobiledevices.list({
        customerId: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.mobiledevices ?? []).map(toMobileRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getMobileDevice(resourceId: string): Promise<MobileDeviceRow> {
    try {
      const response = await this.client.mobiledevices.get({
        customerId: "my_customer",
        resourceId,
      });
      return toMobileRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async mobileAction(
    resourceId: string,
    action: (typeof MOBILE_ACTIONS)[number],
  ): Promise<{ resourceId: string; action: string }> {
    try {
      await this.client.mobiledevices.action({
        customerId: "my_customer",
        resourceId,
        requestBody: { action },
      });
      return { resourceId, action };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listChromeOsDevices(
    args: ListDevicesArgs,
  ): Promise<{ items: ChromeOsDeviceRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.chromeosdevices.list({
        customerId: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.chromeosdevices ?? []).map(toChromeOsRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getChromeOsDevice(deviceId: string): Promise<ChromeOsDeviceRow> {
    try {
      const response = await this.client.chromeosdevices.get({
        customerId: "my_customer",
        deviceId,
      });
      return toChromeOsRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async chromeOsAction(
    resourceId: string,
    action: (typeof CHROMEOS_ACTIONS)[number],
  ): Promise<{ resourceId: string; action: string }> {
    try {
      await this.client.chromeosdevices.action({
        customerId: "my_customer",
        resourceId,
        requestBody: { action },
      });
      return { resourceId, action };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

function toMobileRow(device: admin_directory_v1.Schema$MobileDevice): MobileDeviceRow {
  return {
    ...(device.resourceId ? { resourceId: device.resourceId } : {}),
    ...(device.deviceId ? { deviceId: device.deviceId } : {}),
    ...(device.model ? { model: device.model } : {}),
    ...(device.os ? { os: device.os } : {}),
    ...(device.type ? { type: device.type } : {}),
    ...(device.status ? { status: device.status } : {}),
    ...(device.email?.length ? { email: device.email } : {}),
    ...(device.lastSync ? { lastSync: device.lastSync } : {}),
  };
}

function toChromeOsRow(device: admin_directory_v1.Schema$ChromeOsDevice): ChromeOsDeviceRow {
  return {
    ...(device.deviceId ? { deviceId: device.deviceId } : {}),
    ...(device.serialNumber ? { serialNumber: device.serialNumber } : {}),
    ...(device.model ? { model: device.model } : {}),
    ...(device.status ? { status: device.status } : {}),
    ...(device.orgUnitPath ? { orgUnitPath: device.orgUnitPath } : {}),
    ...(device.annotatedUser ? { annotatedUser: device.annotatedUser } : {}),
    ...(device.lastSync ? { lastSync: device.lastSync } : {}),
  };
}
