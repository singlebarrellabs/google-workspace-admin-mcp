import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";
import type { Access, AnyToolSpec, Surface } from "../catalog.js";
import type { Mode } from "../safety/policy.js";
import { mapGoogleError, ToolError } from "../util/errors.js";
import {
  ALLOWLIST,
  type AllowlistedMethod,
  assertAllowlistClassified,
  findMethod,
  permittedMethods,
} from "./allowlist.js";

const SURFACE: Record<string, Surface> = {
  directory: "directory",
  reports: "reports",
  vault: "vault",
  transfer: "transfer",
};

const EDITION: Record<string, "all" | "enterprise"> = {
  vault: "enterprise",
};

const shape = {
  method: z.string().min(1).describe('Allowlisted method, for example "users.get"'),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("JSON payload passed to the method unchanged"),
  confirm: z.boolean().optional().describe("Required for write methods"),
};

export interface PassthroughDeps {
  auth: OAuth2Client;
  mode: Mode;
  allowlist?: AllowlistedMethod[];
}

/**
 * One raw-call tool per API that appears in the allowlist.
 *
 * The tool is registered as a read tool on purpose: it carries both read and
 * write methods, so dropping it in read-only mode would remove the safe half
 * too. Write methods are refused inside the call instead, and the result tells
 * the audit log which access was actually exercised.
 */
export function passthroughTools(deps: PassthroughDeps): AnyToolSpec[] {
  const allowlist = deps.allowlist ?? ALLOWLIST;
  assertAllowlistClassified(allowlist);

  const apis = [...new Set(allowlist.map((entry) => entry.api))];
  const clients = buildClients(deps.auth);

  return apis
    .filter((api) => clients[api])
    .map((api) => {
      const surface = SURFACE[api] ?? "system";
      const methods = allowlist.filter((entry) => entry.api === api);

      return {
        name: `gws_passthrough_${api}`,
        surface,
        access: "read" as Access,
        edition: EDITION[api] ?? "all",
        description:
          `Call an allowlisted ${api} API method with a raw JSON payload, for cases the curated tools do not cover. ` +
          `Permitted methods: ${methods.map((entry) => entry.method).join(", ")}. ` +
          `Write methods require confirm: true and are refused while the server is read-only.`,
        inputShape: shape,
        run: async (input) => {
          const args = z.object(shape).parse(input);
          const entry = findMethodIn(allowlist, api, args.method);

          if (!entry) {
            throw new ToolError(
              "invalid_request",
              `${api}.${args.method} is not allowlisted.`,
              `Permitted methods: ${permittedMethodsFor(allowlist, api).join(", ")}.`,
            );
          }

          if (entry.access === "write") {
            if (deps.mode !== "write") {
              throw new ToolError(
                "invalid_request",
                `Passthrough write methods are unavailable: write mode is disabled (GWS_MODE is read-only).`,
                "Set GWS_MODE=write and restart the server to enable writes.",
              );
            }
            if (args.confirm !== true) {
              throw new ToolError(
                "invalid_request",
                `${api}.${args.method} changes tenant state.`,
                "Call again with confirm: true after checking the payload.",
              );
            }
          }

          const call = resolveMethod(clients[api], args.method);
          if (!call) {
            throw new ToolError(
              "invalid_request",
              `${api}.${args.method} is allowlisted but not callable in this googleapis version.`,
              "Remove it from the allowlist or update the dependency.",
            );
          }

          try {
            const response = await call({ ...(args.params ?? {}) });
            return {
              summary: `${api}.${args.method} succeeded`,
              data: (response as { data?: unknown }).data,
              access: entry.access,
            };
          } catch (error) {
            throw mapGoogleError(error, surface);
          }
        },
      } satisfies AnyToolSpec;
    });
}

type Client = Record<string, unknown>;

function buildClients(auth: OAuth2Client): Record<string, Client> {
  return {
    directory: google.admin({ version: "directory_v1", auth }) as unknown as Client,
    reports: google.admin({ version: "reports_v1", auth }) as unknown as Client,
    vault: google.vault({ version: "v1", auth }) as unknown as Client,
    transfer: google.admin({ version: "datatransfer_v1", auth }) as unknown as Client,
  };
}

/**
 * Walks the allowlisted dotted path on the resource object. Only names that
 * already passed the allowlist reach this function, and the method keeps its
 * resource as `this` because googleapis methods use it.
 */
function resolveMethod(
  root: Client,
  path: string,
): ((params: unknown) => Promise<unknown>) | undefined {
  const segments = path.split(".");
  let parent: unknown = root;
  let current: unknown = root;

  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    parent = current;
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== "function") return undefined;
  return (params: unknown) =>
    (current as (this: unknown, params: unknown) => Promise<unknown>).call(parent, params);
}

function findMethodIn(
  allowlist: AllowlistedMethod[],
  api: string,
  method: string,
): AllowlistedMethod | undefined {
  return allowlist.find((entry) => entry.api === api && entry.method === method);
}

function permittedMethodsFor(allowlist: AllowlistedMethod[], api: string): string[] {
  return allowlist.filter((entry) => entry.api === api).map((entry) => entry.method);
}

export { findMethod, permittedMethods };
