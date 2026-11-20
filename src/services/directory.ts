import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";

export interface UserRow {
  id: string;
  primaryEmail: string;
  fullName?: string;
  suspended?: boolean;
  orgUnitPath?: string;
  isAdmin?: boolean;
  lastLoginTime?: string;
  changePasswordAtNextLogin?: boolean;
  archived?: boolean;
}

export interface ListUsersArgs {
  query?: string;
  orgUnitPath?: string;
  maxResults?: number;
  pageToken?: string;
  showDeleted?: boolean;
}

export interface ListUsersResult {
  items: UserRow[];
  nextPageToken?: string;
}

export interface CreateUserArgs {
  primaryEmail: string;
  givenName: string;
  familyName: string;
  password?: string;
  orgUnitPath?: string;
  changePasswordAtNextLogin?: boolean;
}

/** Only fields this server is willing to change. isAdmin is deliberately absent. */
export interface PatchUserArgs {
  fullName?: { givenName: string; familyName: string };
  orgUnitPath?: string;
  changePasswordAtNextLogin?: boolean;
  archived?: boolean;
}

export interface AliasRow {
  alias: string;
  primaryEmail?: string;
}

export class DirectoryService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listUsers(args: ListUsersArgs): Promise<ListUsersResult> {
    try {
      const params: admin_directory_v1.Params$Resource$Users$List = {
        customer: "my_customer",
        query: buildUserQuery(args),
        maxResults: args.maxResults ?? 100,
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
        ...(args.showDeleted ? { showDeleted: "true" as const } : {}),
      };
      const response = await this.client.users.list(params);

      const users = response.data.users ?? [];
      return {
        items: users.map(toUserRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getUser(userKey: string): Promise<UserRow> {
    try {
      const response = await this.client.users.get({ userKey });
      return toUserRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async createUser(args: CreateUserArgs): Promise<UserRow> {
    try {
      const response = await this.client.users.insert({
        requestBody: {
          primaryEmail: args.primaryEmail,
          name: { givenName: args.givenName, familyName: args.familyName },
          // A new account that keeps its first password is a standing risk, so
          // the default is a forced change at first sign-in.
          changePasswordAtNextLogin: args.changePasswordAtNextLogin ?? true,
          ...(args.password ? { password: args.password } : {}),
          ...(args.orgUnitPath ? { orgUnitPath: args.orgUnitPath } : {}),
        },
      });
      return toUserRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  /**
   * Partial update. users.update is a PUT that blanks every omitted field, so
   * this only ever sends users.patch with the keys the caller supplied.
   */
  async patchUser(userKey: string, patch: PatchUserArgs): Promise<UserRow> {
    if (Object.keys(patch).length === 0) {
      throw new ToolError(
        "invalid_request",
        "No fields were supplied to change.",
        "Pass at least one of fullName, orgUnitPath, changePasswordAtNextLogin or archived.",
      );
    }

    try {
      const response = await this.client.users.patch({
        userKey,
        requestBody: {
          ...(patch.fullName ? { name: patch.fullName } : {}),
          ...(patch.orgUnitPath ? { orgUnitPath: patch.orgUnitPath } : {}),
          ...(patch.changePasswordAtNextLogin === undefined
            ? {}
            : { changePasswordAtNextLogin: patch.changePasswordAtNextLogin }),
          ...(patch.archived === undefined ? {} : { archived: patch.archived }),
        },
      });
      return toUserRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async suspendUser(userKey: string): Promise<UserRow> {
    return this.setSuspended(userKey, true);
  }

  async unsuspendUser(userKey: string): Promise<UserRow> {
    return this.setSuspended(userKey, false);
  }

  private async setSuspended(userKey: string, suspended: boolean): Promise<UserRow> {
    try {
      const response = await this.client.users.patch({
        userKey,
        requestBody: { suspended },
      });
      return toUserRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async deleteUser(userKey: string): Promise<void> {
    try {
      await this.client.users.delete({ userKey });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  /** users.undelete returns no body, so the restored row is read back explicitly. */
  async undeleteUser(userKey: string, orgUnitPath: string): Promise<UserRow> {
    try {
      await this.client.users.undelete({ userKey, requestBody: { orgUnitPath } });
      return await this.getUser(userKey);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listAliases(userKey: string): Promise<AliasRow[]> {
    try {
      const response = await this.client.users.aliases.list({ userKey });
      return (response.data.aliases ?? []).map(toAliasRow);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async insertAlias(userKey: string, alias: string): Promise<AliasRow> {
    try {
      const response = await this.client.users.aliases.insert({
        userKey,
        requestBody: { alias },
      });
      return toAliasRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async deleteAlias(userKey: string, alias: string): Promise<void> {
    try {
      await this.client.users.aliases.delete({ userKey, alias });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

/** The Directory API has no org-unit parameter on users.list; it is a query clause. */
function buildUserQuery(args: ListUsersArgs): string | undefined {
  const parts = [args.query];
  if (args.orgUnitPath) parts.push(`orgUnitPath='${args.orgUnitPath}'`);
  const query = parts.filter(Boolean).join(" ").trim();
  return query.length > 0 ? query : undefined;
}

function toUserRow(user: admin_directory_v1.Schema$User): UserRow {
  return {
    id: user.id ?? "",
    primaryEmail: user.primaryEmail ?? "",
    ...(user.name?.fullName ? { fullName: user.name.fullName } : {}),
    ...(user.suspended === undefined || user.suspended === null
      ? {}
      : { suspended: user.suspended }),
    ...(user.orgUnitPath ? { orgUnitPath: user.orgUnitPath } : {}),
    ...(user.isAdmin === undefined || user.isAdmin === null ? {} : { isAdmin: user.isAdmin }),
    ...(user.lastLoginTime ? { lastLoginTime: user.lastLoginTime } : {}),
    ...(user.changePasswordAtNextLogin === undefined || user.changePasswordAtNextLogin === null
      ? {}
      : { changePasswordAtNextLogin: user.changePasswordAtNextLogin }),
    ...(user.archived === undefined || user.archived === null ? {} : { archived: user.archived }),
  };
}

function toAliasRow(alias: admin_directory_v1.Schema$Alias): AliasRow {
  return {
    alias: alias.alias ?? "",
    ...(alias.primaryEmail ? { primaryEmail: alias.primaryEmail } : {}),
  };
}
