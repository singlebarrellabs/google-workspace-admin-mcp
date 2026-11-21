#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { OAuth2Client } from "google-auth-library";
import { loadConfig } from "./auth/config.js";
import { EditionProbe } from "./auth/edition.js";
import { authorize, createOAuthClient } from "./auth/oauth.js";
import { FileTokenStore } from "./auth/token-store.js";
import { passthroughTools } from "./passthrough/dispatch.js";
import { buildServer } from "./server.js";
import { CloudSearchService } from "./services/cloud-search.js";
import { DevicesService } from "./services/devices.js";
import { DirectoryService } from "./services/directory.js";
import { GroupsService } from "./services/directory-groups.js";
import { DomainsService } from "./services/domains.js";
import { GroupSettingsService } from "./services/group-settings.js";
import { LicensingService } from "./services/licensing.js";
import { OrgUnitsService } from "./services/orgunits.js";
import { ReportsService } from "./services/reports.js";
import { ResourcesService } from "./services/resources.js";
import { RolesService } from "./services/roles.js";
import { TransferService } from "./services/transfer.js";
import { UserSecurityService } from "./services/user-security.js";
import { VaultService } from "./services/vault.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === "--version" || command === "-v") {
    process.stdout.write(`google-workspace-admin-mcp ${VERSION}\n`);
    return;
  }

  const config = loadConfig();
  const store = new FileTokenStore(config.tokenPath);

  if (command === "auth") {
    const token = await authorize(config, store);
    process.stdout.write(`Authorized. Token stored at ${config.tokenPath}\n`);
    void token;
    return;
  }

  const token = await store.load();
  const auth = token ? authorizedClient(config, token) : undefined;

  const { server } = buildServer({
    config,
    token,
    vault: auth ? new VaultService(auth) : undefined,
    cloudSearch: auth ? new CloudSearchService(auth) : undefined,
    transfer: auth ? new TransferService(auth) : undefined,
    resources: auth ? new ResourcesService(auth) : undefined,
    groupSettings: auth ? new GroupSettingsService(auth) : undefined,
    licensing: auth ? new LicensingService(auth) : undefined,
    passthrough:
      auth && config.passthrough ? passthroughTools({ auth, mode: config.mode }) : undefined,
    directory: auth
      ? {
          users: new DirectoryService(auth),
          domains: new DomainsService(auth),
          groups: new GroupsService(auth),
          orgUnits: new OrgUnitsService(auth),
          roles: new RolesService(auth),
          devices: new DevicesService(auth),
          userSecurity: new UserSecurityService(auth),
        }
      : undefined,
    edition: auth ? new EditionProbe(auth) : undefined,
    reports: auth ? new ReportsService(auth) : undefined,
  });

  await server.connect(new StdioServerTransport());
}

function authorizedClient(
  config: ReturnType<typeof loadConfig>,
  token: { access_token?: string; refresh_token?: string; expiry_date?: number },
): OAuth2Client {
  const client = createOAuthClient(config);
  client.setCredentials(token);
  return client;
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
