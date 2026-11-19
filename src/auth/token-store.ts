import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ToolError } from "../util/errors.js";

export interface StoredToken {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

const OWNER_ONLY = 0o600;

export class FileTokenStore {
  constructor(private readonly path: string) {}

  async load(): Promise<StoredToken | undefined> {
    let mode: number;
    try {
      mode = (await stat(this.path)).mode & 0o777;
    } catch {
      return undefined;
    }

    if ((mode & 0o077) !== 0) {
      throw new ToolError(
        "auth_required",
        `The token file at ${this.path} is readable by other users.`,
        `Run: chmod 600 ${this.path} — or delete it and re-authorize.`,
      );
    }

    try {
      return JSON.parse(await readFile(this.path, "utf8")) as StoredToken;
    } catch (error) {
      throw new ToolError(
        "auth_required",
        `The token file at ${this.path} is not valid JSON: ${(error as Error).message}`,
        "Delete it and re-authorize.",
      );
    }
  }

  async save(token: StoredToken): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(token, null, 2), { mode: OWNER_ONLY });
    await chmod(temp, OWNER_ONLY);
    await rename(temp, this.path);
    await chmod(this.path, OWNER_ONLY);
  }
}
