#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { OAuth2Client } from "google-auth-library";
import { loadConfig } from "./auth/config.js";
import { authorize, createOAuthClient } from "./auth/oauth.js";
import { FileTokenStore } from "./auth/token-store.js";
import { buildServer } from "./server.js";
import { DirectoryService } from "./services/directory.js";
import { DomainsService } from "./services/domains.js";

const VERSION = "0.1.0";

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
    directory: auth ? new DirectoryService(auth) : undefined,
    domains: auth ? new DomainsService(auth) : undefined,
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
