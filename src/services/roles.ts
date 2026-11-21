import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface RoleRow {
  roleId?: string;
  roleName?: string;
  roleDescription?: string;
  isSystemRole?: boolean;
  isSuperAdminRole?: boolean;
}

export interface PrivilegeRow {
  serviceId?: string;
  serviceName?: string;
  privilegeName?: string;
  isOuScopable?: boolean;
}

export interface AssignmentRow {
  roleAssignmentId?: string;
  roleId?: string;
  assignedTo?: string;
  scopeType?: string;
  orgUnitId?: string;
}

export interface InsertRoleArgs {
  roleName: string;
  roleDescription?: string;
  privileges: Array<{ serviceId: string; privilegeName: string }>;
}

export interface InsertAssignmentArgs {
  roleId: string;
  assignedTo: string;
  scopeType: "CUSTOMER" | "ORG_UNIT";
  orgUnitId?: string;
}

/**
 * Custom roles and their assignments. System roles can be listed but not
 * created or deleted; the API refuses those, and the error mapper reports it.
 */
export class RolesService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listRoles(): Promise<{ items: RoleRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.roles.list({
        customer: "my_customer",
        maxResults: 100,
      });
      return {
        items: (response.data.items ?? []).map(toRoleRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listPrivileges(): Promise<PrivilegeRow[]> {
    try {
      const response = await this.client.privileges.list({ customer: "my_customer" });
      return (response.data.items ?? []).map(toPrivilegeRow);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async insertRole(args: InsertRoleArgs): Promise<RoleRow> {
    try {
      const response = await this.client.roles.insert({
        customer: "my_customer",
        requestBody: {
          roleName: args.roleName,
          ...(args.roleDescription ? { roleDescription: args.roleDescription } : {}),
          rolePrivileges: args.privileges.map((privilege) => ({
            serviceId: privilege.serviceId,
            privilegeName: privilege.privilegeName,
          })),
        },
      });
      return toRoleRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async deleteRole(roleId: string): Promise<void> {
    try {
      await this.client.roles.delete({ customer: "my_customer", roleId });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listAssignments(args: {
    userKey?: string;
    roleId?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ items: AssignmentRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.roleAssignments.list({
        customer: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.userKey ? { userKey: args.userKey } : {}),
        ...(args.roleId ? { roleId: args.roleId } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.items ?? []).map(toAssignmentRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async insertAssignment(args: InsertAssignmentArgs): Promise<AssignmentRow> {
    try {
      const response = await this.client.roleAssignments.insert({
        customer: "my_customer",
        requestBody: {
          roleId: args.roleId,
          assignedTo: args.assignedTo,
          scopeType: args.scopeType,
          ...(args.orgUnitId ? { orgUnitId: args.orgUnitId } : {}),
        },
      });
      return toAssignmentRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async deleteAssignment(roleAssignmentId: string): Promise<void> {
    try {
      await this.client.roleAssignments.delete({
        customer: "my_customer",
        roleAssignmentId,
      });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

function toRoleRow(role: admin_directory_v1.Schema$Role): RoleRow {
  return {
    ...(role.roleId ? { roleId: role.roleId } : {}),
    ...(role.roleName ? { roleName: role.roleName } : {}),
    ...(role.roleDescription ? { roleDescription: role.roleDescription } : {}),
    ...(role.isSystemRole === undefined || role.isSystemRole === null
      ? {}
      : { isSystemRole: role.isSystemRole }),
    ...(role.isSuperAdminRole === undefined || role.isSuperAdminRole === null
      ? {}
      : { isSuperAdminRole: role.isSuperAdminRole }),
  };
}

function toPrivilegeRow(privilege: admin_directory_v1.Schema$Privilege): PrivilegeRow {
  return {
    ...(privilege.serviceId ? { serviceId: privilege.serviceId } : {}),
    ...(privilege.serviceName ? { serviceName: privilege.serviceName } : {}),
    ...(privilege.privilegeName ? { privilegeName: privilege.privilegeName } : {}),
    ...(privilege.isOuScopable === undefined || privilege.isOuScopable === null
      ? {}
      : { isOuScopable: privilege.isOuScopable }),
  };
}

function toAssignmentRow(assignment: admin_directory_v1.Schema$RoleAssignment): AssignmentRow {
  return {
    ...(assignment.roleAssignmentId ? { roleAssignmentId: assignment.roleAssignmentId } : {}),
    ...(assignment.roleId ? { roleId: assignment.roleId } : {}),
    ...(assignment.assignedTo ? { assignedTo: assignment.assignedTo } : {}),
    ...(assignment.scopeType ? { scopeType: assignment.scopeType } : {}),
    ...(assignment.orgUnitId ? { orgUnitId: assignment.orgUnitId } : {}),
  };
}
