import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface OrgUnitRow {
  orgUnitId?: string;
  name: string;
  orgUnitPath?: string;
  parentOrgUnitPath?: string;
  description?: string;
  blockInheritance?: boolean;
}

export interface ListOrgUnitsArgs {
  orgUnitPath?: string;
  type?: "all" | "children" | "self";
}

export interface CreateOrgUnitArgs {
  name: string;
  parentOrgUnitPath: string;
  description?: string;
  blockInheritance?: boolean;
}

export interface UpdateOrgUnitArgs {
  name?: string;
  parentOrgUnitPath?: string;
  description?: string;
  blockInheritance?: boolean;
}

export class OrgUnitsService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listOrgUnits(args: ListOrgUnitsArgs): Promise<OrgUnitRow[]> {
    try {
      const response = await this.client.orgunits.list({
        customerId: "my_customer",
        type: args.type ?? "all",
        ...(args.orgUnitPath ? { orgUnitPath: args.orgUnitPath } : {}),
      });
      return (response.data.organizationUnits ?? []).map(toOrgUnitRow);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getOrgUnit(orgUnitPath: string): Promise<OrgUnitRow> {
    try {
      const response = await this.client.orgunits.get({
        customerId: "my_customer",
        orgUnitPath,
      });
      return toOrgUnitRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async createOrgUnit(args: CreateOrgUnitArgs): Promise<OrgUnitRow> {
    try {
      const response = await this.client.orgunits.insert({
        customerId: "my_customer",
        requestBody: {
          name: args.name,
          parentOrgUnitPath: args.parentOrgUnitPath,
          ...(args.description ? { description: args.description } : {}),
          ...(args.blockInheritance === undefined
            ? {}
            : { blockInheritance: args.blockInheritance }),
        },
      });
      return toOrgUnitRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  /**
   * The org unit API has no partial update, so the current unit is read first
   * and only the supplied fields are replaced. Sending a bare PUT would clear
   * every field the caller did not mention.
   */
  async updateOrgUnit(orgUnitPath: string, update: UpdateOrgUnitArgs): Promise<OrgUnitRow> {
    const current = await this.getOrgUnit(orgUnitPath);
    try {
      const response = await this.client.orgunits.update({
        customerId: "my_customer",
        orgUnitPath,
        requestBody: {
          name: update.name ?? current.name,
          parentOrgUnitPath: update.parentOrgUnitPath ?? current.parentOrgUnitPath ?? "/",
          description: update.description ?? current.description,
          blockInheritance: update.blockInheritance ?? current.blockInheritance,
        },
      });
      return toOrgUnitRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async deleteOrgUnit(orgUnitPath: string): Promise<void> {
    try {
      await this.client.orgunits.delete({ customerId: "my_customer", orgUnitPath });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

function toOrgUnitRow(unit: admin_directory_v1.Schema$OrgUnit): OrgUnitRow {
  return {
    name: unit.name ?? "",
    ...(unit.orgUnitId ? { orgUnitId: unit.orgUnitId } : {}),
    ...(unit.orgUnitPath ? { orgUnitPath: unit.orgUnitPath } : {}),
    ...(unit.parentOrgUnitPath ? { parentOrgUnitPath: unit.parentOrgUnitPath } : {}),
    ...(unit.description ? { description: unit.description } : {}),
    ...(unit.blockInheritance === undefined || unit.blockInheritance === null
      ? {}
      : { blockInheritance: unit.blockInheritance }),
  };
}
