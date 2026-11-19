import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface UserRow {
  id: string;
  primaryEmail: string;
  fullName?: string;
  suspended?: boolean;
  orgUnitPath?: string;
  isAdmin?: boolean;
  lastLoginTime?: string;
}

export interface ListUsersArgs {
  query?: string;
  orgUnitPath?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface ListUsersResult {
  items: UserRow[];
  nextPageToken?: string;
}

export class DirectoryService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listUsers(args: ListUsersArgs): Promise<ListUsersResult> {
    try {
      const response = await this.client.users.list({
        customer: "my_customer",
        query: buildUserQuery(args),
        maxResults: args.maxResults ?? 100,
        pageToken: args.pageToken,
      });

      const users = response.data.users ?? [];
      return {
        items: users.map(toUserRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async suspendUser(userKey: string): Promise<UserRow> {
    try {
      // users.patch is the partial update: sending the whole user via
      // users.update (PUT) would blank every field we did not include.
      const response = await this.client.users.patch({
        userKey,
        requestBody: { suspended: true },
      });
      return toUserRow(response.data);
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
  };
}
