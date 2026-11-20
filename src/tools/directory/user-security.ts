import { z } from "zod";
import type { ConfirmedToolSpec, ToolSpec } from "../../catalog.js";
import type { UserSecurityService } from "../../services/user-security.js";

const userKeyShape = {
  userKey: z.string().min(1).describe("Primary email or immutable user id"),
};

const tokenShape = {
  ...userKeyShape,
  clientId: z.string().min(1).describe("Client id from the token list"),
};

const signOutShape = {
  ...userKeyShape,
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true. Every web and device session ends and the user signs in again"),
};

export function userSecurityTools(
  service: UserSecurityService,
): Array<ToolSpec | ConfirmedToolSpec> {
  return [
    {
      name: "gws_user_tokens_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "List the third-party apps a user has granted access to, with their scopes and whether the grant is anonymous.",
      inputShape: userKeyShape,
      run: async (input) => {
        const args = z.object(userKeyShape).parse(input);
        const items = await service.listTokens(args.userKey);
        return {
          summary: `${items.length} app grant${items.length === 1 ? "" : "s"} for ${args.userKey}`,
          data: { items },
        };
      },
    },
    {
      name: "gws_user_tokens_delete",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "Revoke one app's access for a user. The app loses its refresh token immediately and the user must consent again.",
      confirmNote: "the app's access ends now and the user has to grant it again",
      inputShape: tokenShape,
      run: async (input) => {
        const args = z.object(tokenShape).parse(input);
        await service.deleteToken(args.userKey, args.clientId);
        return {
          summary: `Revoked ${args.clientId} for ${args.userKey}`,
          data: { userKey: args.userKey, clientId: args.clientId, revoked: true },
        };
      },
    },
    {
      name: "gws_user_verification_codes_generate",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Generate new backup verification codes for a user, replacing any existing ones. The codes are returned because the admin hands them over; treat the result as a credential.",
      inputShape: userKeyShape,
      run: async (input) => {
        const args = z.object(userKeyShape).parse(input);
        const items = await service.generateVerificationCodes(args.userKey);
        return {
          summary: `${items.length} verification codes issued for ${args.userKey}; hand them over and do not store them`,
          data: { userKey: args.userKey, items },
        };
      },
    },
    {
      name: "gws_user_verification_codes_invalidate",
      surface: "directory",
      access: "write",
      edition: "all",
      description:
        "Invalidate a user's backup verification codes. Use after a suspected compromise, before issuing new ones.",
      inputShape: userKeyShape,
      run: async (input) => {
        const args = z.object(userKeyShape).parse(input);
        await service.invalidateVerificationCodes(args.userKey);
        return {
          summary: `Verification codes invalidated for ${args.userKey}`,
          data: { userKey: args.userKey, invalidated: true },
        };
      },
    },
    {
      name: "gws_user_sign_out",
      surface: "directory",
      access: "destructive",
      edition: "all",
      description:
        "End every web and device session for a user. The account stays usable; the user signs in again. This is the fast response to a suspected compromised session.",
      confirmNote: "every session ends now and the user must sign in again everywhere",
      inputShape: signOutShape,
      run: async (input) => {
        const args = z.object(signOutShape).parse(input);
        await service.signOut(args.userKey);
        return {
          summary: `Signed ${args.userKey} out of every session`,
          data: { userKey: args.userKey, signedOut: true },
        };
      },
    },
  ];
}
