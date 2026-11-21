import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";

export interface GroupRow {
  id?: string;
  email: string;
  name?: string;
  description?: string;
  directMembersCount?: string;
  adminCreated?: boolean;
  aliases?: string[];
}

export interface MemberRow {
  id?: string;
  email: string;
  role?: string;
  type?: string;
  status?: string;
}

export interface ListGroupsArgs {
  query?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface ListMembersArgs {
  groupKey: string;
  roles?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface CreateGroupArgs {
  email: string;
  name: string;
  description?: string;
}

export interface PatchGroupArgs {
  name?: string;
  description?: string;
}

export interface AddMemberArgs {
  groupKey: string;
  email: string;
  role?: "MEMBER" | "MANAGER" | "OWNER";
  type?: "USER" | "GROUP";
}

/** Groups and their memberships. */
export class GroupsService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listGroups(args: ListGroupsArgs): Promise<{ items: GroupRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.groups.list({
        customer: "my_customer",
        maxResults: args.maxResults ?? 100,
        ...(args.query ? { query: args.query } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.groups ?? []).map(toGroupRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getGroup(groupKey: string): Promise<GroupRow> {
    try {
      const response = await this.client.groups.get({ groupKey });
      return toGroupRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async createGroup(args: CreateGroupArgs): Promise<GroupRow> {
    try {
      const response = await this.client.groups.insert({
        requestBody: {
          email: args.email,
          name: args.name,
          ...(args.description ? { description: args.description } : {}),
        },
      });
      return toGroupRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  /** groups.patch keeps the fields the caller did not mention. */
  async patchGroup(groupKey: string, patch: PatchGroupArgs): Promise<GroupRow> {
    if (patch.name === undefined && patch.description === undefined) {
      throw new ToolError(
        "invalid_request",
        "No fields were supplied to change.",
        "Pass name or description.",
      );
    }

    try {
      const response = await this.client.groups.patch({
        groupKey,
        requestBody: {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
        },
      });
      return toGroupRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async deleteGroup(groupKey: string): Promise<void> {
    try {
      await this.client.groups.delete({ groupKey });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listMembers(
    args: ListMembersArgs,
  ): Promise<{ items: MemberRow[]; nextPageToken?: string }> {
    try {
      const response = await this.client.members.list({
        groupKey: args.groupKey,
        maxResults: args.maxResults ?? 100,
        ...(args.roles ? { roles: args.roles } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
      });
      return {
        items: (response.data.members ?? []).map(toMemberRow),
        ...(response.data.nextPageToken ? { nextPageToken: response.data.nextPageToken } : {}),
      };
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getMember(groupKey: string, memberKey: string): Promise<MemberRow> {
    try {
      const response = await this.client.members.get({ groupKey, memberKey });
      return toMemberRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async addMember(args: AddMemberArgs): Promise<MemberRow> {
    try {
      const response = await this.client.members.insert({
        groupKey: args.groupKey,
        requestBody: {
          email: args.email,
          role: args.role ?? "MEMBER",
          type: args.type ?? "USER",
        },
      });
      return toMemberRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async removeMember(groupKey: string, memberKey: string): Promise<void> {
    try {
      await this.client.members.delete({ groupKey, memberKey });
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

function toGroupRow(group: admin_directory_v1.Schema$Group): GroupRow {
  return {
    email: group.email ?? "",
    ...(group.id ? { id: group.id } : {}),
    ...(group.name ? { name: group.name } : {}),
    ...(group.description ? { description: group.description } : {}),
    ...(group.directMembersCount ? { directMembersCount: group.directMembersCount } : {}),
    ...(group.adminCreated === undefined || group.adminCreated === null
      ? {}
      : { adminCreated: group.adminCreated }),
    ...(group.aliases?.length ? { aliases: group.aliases } : {}),
  };
}

function toMemberRow(member: admin_directory_v1.Schema$Member): MemberRow {
  return {
    email: member.email ?? "",
    ...(member.id ? { id: member.id } : {}),
    ...(member.role ? { role: member.role } : {}),
    ...(member.type ? { type: member.type } : {}),
    ...(member.status ? { status: member.status } : {}),
  };
}
