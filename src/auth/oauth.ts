import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { OAuth2Client } from "google-auth-library";
import { ToolError } from "../util/errors.js";
import type { AppConfig } from "./config.js";
import type { FileTokenStore, StoredToken } from "./token-store.js";

export function createOAuthClient(config: AppConfig): OAuth2Client {
  if (!config.clientId || !config.clientSecret) {
    throw new ToolError(
      "auth_required",
      "No OAuth client configured.",
      "Set GWS_CLIENT_ID and GWS_CLIENT_SECRET from your own Google Cloud project, then run: npx google-workspace-admin-mcp auth",
    );
  }
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret });
}

/**
 * Loopback consent flow. Prints the URL instead of opening a browser so it works
 * over SSH, and waits for the callback on a local ephemeral port.
 */
export async function authorize(
  config: AppConfig,
  store: FileTokenStore,
  timeoutMs = 5 * 60 * 1000,
): Promise<StoredToken> {
  const client = createOAuthClient(config);
  const { server, port } = await listen();
  const redirectUri = `http://127.0.0.1:${port}`;
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: config.scopes,
    redirect_uri: redirectUri,
  });

  process.stderr.write(
    [
      "",
      "Open this URL and approve access with your administrator account:",
      url,
      "",
      "Waiting for the callback. Ctrl+C to abort.",
      "",
    ].join("\n"),
  );

  const code = await waitForCode(server, timeoutMs);
  server.close();

  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  const stored: StoredToken = {
    refresh_token: tokens.refresh_token ?? undefined,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
  };

  if (!stored.refresh_token) {
    throw new ToolError(
      "auth_required",
      "Google did not return a refresh token.",
      "Remove the app's existing grant in your Google Account permissions, then run auth again.",
    );
  }

  await store.save(stored);
  return stored;
}

function listen(): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

function waitForCode(server: ReturnType<typeof createServer>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ToolError("auth_required", "Authorization timed out after five minutes."));
    }, timeoutMs);

    server.on("request", (req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        clearTimeout(timer);
        res.writeHead(400, { "content-type": "text/plain" }).end(`Authorization failed: ${error}`);
        reject(new ToolError("auth_required", `Google returned: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(404, { "content-type": "text/plain" }).end("Waiting for the OAuth callback.");
        return;
      }

      clearTimeout(timer);
      res
        .writeHead(200, { "content-type": "text/plain" })
        .end("Authorized. You can close this tab.");
      resolve(code);
    });
  });
}
