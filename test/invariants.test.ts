import { OAuth2Client } from "google-auth-library";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/auth/config.js";
import { buildServer } from "../src/server.js";
import { DevicesService } from "../src/services/devices.js";
import { DirectoryService } from "../src/services/directory.js";
import { GroupsService } from "../src/services/directory-groups.js";
import { DomainsService } from "../src/services/domains.js";
import { OrgUnitsService } from "../src/services/orgunits.js";
import { RolesService } from "../src/services/roles.js";
import { UserSecurityService } from "../src/services/user-security.js";

function deps(mode: "readonly" | "write") {
  const config = {
    ...loadConfig({ GWS_MODE: mode }),
    tokenPath: "/tmp/test-token.json",
    auditPath: "/tmp/test-audit.jsonl",
  };
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  return {
    config,
    directory: {
      users: new DirectoryService(auth),
      domains: new DomainsService(auth),
      groups: new GroupsService(auth),
      orgUnits: new OrgUnitsService(auth),
      roles: new RolesService(auth),
      devices: new DevicesService(auth),
      userSecurity: new UserSecurityService(auth),
    },
  };
}

describe("tool registration invariants", () => {
  it("registers no mutating tool in read-only mode", () => {
    const { server } = buildServer(deps("readonly"));
    const tools = listTools(server);
    expect(tools).toContain("gws_users_list");
    expect(tools).not.toContain("gws_users_suspend");
  });

  it("registers mutating tools in write mode", () => {
    const { server } = buildServer(deps("write"));
    expect(listTools(server)).toContain("gws_users_suspend");
  });

  it("exposes no impersonation parameter in any tool schema", () => {
    const { server } = buildServer(deps("write"));
    for (const tool of toolEntries(server)) {
      const properties = Object.keys(tool.inputSchema ?? {});
      expect(properties, `${tool.name} must not accept "as"`).not.toContain("as");
      expect(properties).not.toContain("subject");
      expect(properties).not.toContain("impersonate");
    }
  });
});

interface RegisteredTool {
  name: string;
  inputSchema?: Record<string, unknown>;
}

function toolEntries(server: unknown): RegisteredTool[] {
  const underlying = (server as { _registeredTools?: Record<string, RegisteredTool> })
    ._registeredTools;
  return Object.entries(underlying ?? {}).map(([name, tool]) => ({ ...tool, name }));
}

function listTools(server: unknown): string[] {
  return toolEntries(server).map((tool) => tool.name);
}
