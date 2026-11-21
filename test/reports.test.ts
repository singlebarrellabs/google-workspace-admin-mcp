import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/auth/config.js";
import { buildServer } from "../src/server.js";
import { ReportsService } from "../src/services/reports.js";
import { reportsTools } from "../src/tools/reports.js";

const NOW = Date.parse("2026-11-19T12:00:00.000Z");

function activityPath(userKey: string, applicationName: string): string {
  return `/admin/reports/v1/activity/users/${userKey}/applications/${applicationName}`;
}

function customerUsagePath(date: string): string {
  return `/admin/reports/v1/usage/dates/${date}`;
}

function userUsagePath(userKey: string, date: string): string {
  return `/admin/reports/v1/usage/users/${userKey}/dates/${date}`;
}

function entityUsagePath(entityType: string, entityKey: string, date: string): string {
  return `/admin/reports/v1/usage/${entityType}/${entityKey}/dates/${date}`;
}

function service(): ReportsService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new ReportsService(auth);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  nock.cleanAll();
});

describe("reports activities", () => {
  it("rejects an application outside the API's enum before the request", async () => {
    const spec = reportsTools(service()).find(
      (candidate) => candidate.name === "gws_activities_list",
    );
    if (!spec) throw new Error("gws_activities_list not built");

    await expect(spec.run({ applicationName: "not_an_app" }, { dryRun: false })).rejects.toThrow();
  });

  it("flattens one activity into one row per event", async () => {
    nock("https://admin.googleapis.com")
      .get(activityPath("all", "login"))
      .query(true)
      .reply(200, {
        items: [
          {
            id: {
              time: "2026-11-18T09:00:00.000Z",
              applicationName: "login",
              customerId: "C123",
              uniqueQualifier: "q1",
            },
            actor: { email: "user-1@example.com", profileId: "1001" },
            ipAddress: "203.0.113.7",
            events: [
              {
                name: "login_success",
                parameters: [
                  { name: "login_type", value: "google_password" },
                  { name: "login_challenge_method", multiValue: ["password", "totp"] },
                ],
                status: { eventStatus: "SUCCEEDED" },
              },
              { name: "login_failure", parameters: [] },
            ],
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listActivities({ applicationName: "login" });

    expect(result.items).toHaveLength(2);
    expect(result.nextPageToken).toBe("page-2");
    expect(result.items[0]).toEqual({
      time: "2026-11-18T09:00:00.000Z",
      applicationName: "login",
      actor: "user-1@example.com",
      actorKey: "1001",
      ipAddress: "203.0.113.7",
      eventName: "login_success",
      eventStatus: "SUCCEEDED",
      parameters: {
        login_type: "google_password",
        login_challenge_method: "password,totp",
      },
    });
    expect(result.items[1].eventName).toBe("login_failure");
  });

  it("applies and reports a 7-day window when no range is given", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(activityPath("all", "admin"))
      .query((query) => {
        expect(query.startTime).toBe("2026-11-12T12:00:00.000Z");
        expect(query.endTime).toBe("2026-11-19T12:00:00.000Z");
        return true;
      })
      .reply(200, { items: [] });

    const result = await service().listActivities({ applicationName: "admin" });

    expect(result.items).toEqual([]);
    expect(result.appliedTimeRange).toEqual({
      startTime: "2026-11-12T12:00:00.000Z",
      endTime: "2026-11-19T12:00:00.000Z",
      defaulted: true,
    });
    expect(scope.isDone()).toBe(true);
  });

  it("keeps an explicit range and marks it as not defaulted", async () => {
    nock("https://admin.googleapis.com")
      .get(activityPath("user-2%40example.com", "token"))
      .query(true)
      .reply(200, { items: [] });

    const result = await service().listActivities({
      applicationName: "token",
      userKey: "user-2@example.com",
      startTime: "2026-11-17T00:00:00.000Z",
      endTime: "2026-11-18T00:00:00.000Z",
    });

    expect(result.appliedTimeRange.defaulted).toBe(false);
    expect(result.appliedTimeRange.startTime).toBe("2026-11-17T00:00:00.000Z");
  });

  it("refuses a Gmail window wider than 30 days without calling the API", async () => {
    await expect(
      service().listActivities({
        applicationName: "gmail",
        startTime: "2026-09-01T00:00:00.000Z",
        endTime: "2026-11-19T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ category: "invalid_request" });
  });

  it("caps flattened rows at 500 and says so", async () => {
    const events = Array.from({ length: 600 }, (_, index) => ({ name: `event_${index}` }));
    nock("https://admin.googleapis.com")
      .get(activityPath("all", "drive"))
      .query(true)
      .reply(200, {
        items: [{ id: { time: "2026-11-18T00:00:00.000Z", applicationName: "drive" }, events }],
      });

    const result = await service().listActivities({ applicationName: "drive" });

    expect(result.items).toHaveLength(500);
    expect(result.rowsTruncated).toBe(true);
  });

  it("maps a 403 to permission_denied", async () => {
    nock("https://admin.googleapis.com")
      .get(activityPath("all", "login"))
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Not Authorized", errors: [{ reason: "forbidden" }] },
      });

    await expect(service().listActivities({ applicationName: "login" })).rejects.toMatchObject({
      category: "permission_denied",
    });
  });
});

describe("reports usage", () => {
  it("reports an empty customer report as empty rather than as an error", async () => {
    nock("https://admin.googleapis.com")
      .get(customerUsagePath("2026-11-18"))
      .query(true)
      .reply(200, { usageReports: [] });

    const result = await service().customerUsage({ date: "2026-11-18" });

    expect(result.empty).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.parametersObserved).toEqual([]);
    expect(result.parameterReference).toMatch(/usage-ref-appendix-a\/customers$/);
  });

  it("normalises parameters and lists the names it observed", async () => {
    let seen: Record<string, string> = {};
    nock("https://admin.googleapis.com")
      .get(customerUsagePath("2026-11-18"))
      .query((query) => {
        seen = query as Record<string, string>;
        return true;
      })
      .reply(200, {
        usageReports: [
          {
            date: "2026-11-18",
            entity: { type: "customer", customerId: "C123" },
            parameters: [
              { name: "accounts:num_users", intValue: "42" },
              { name: "gmail:num_emails_sent", intValue: "17" },
              { name: "gmail:num_emails_sent", intValue: "17" },
            ],
          },
        ],
      });

    const result = await service().customerUsage({
      date: "2026-11-18",
      parameters: ["accounts:num_users", "gmail:num_emails_sent"],
    });

    expect(seen.parameters).toBe("accounts:num_users,gmail:num_emails_sent");
    expect(result.empty).toBe(false);
    expect(result.items[0].parameters).toEqual({
      "accounts:num_users": "42",
      "gmail:num_emails_sent": "17",
    });
    expect(result.parametersObserved).toEqual(["accounts:num_users", "gmail:num_emails_sent"]);
  });

  it("passes user report parameters as one comma-separated string", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(userUsagePath("user-3%40example.com", "2026-11-18"))
      .query((query) => {
        expect(query.parameters).toBe("gmail:num_emails_sent,drive:num_items_created");
        expect(String(query.maxResults)).toBe("100");
        return true;
      })
      .reply(200, {
        usageReports: [
          {
            date: "2026-11-18",
            entity: { type: "user", userEmail: "user-3@example.com" },
            parameters: [{ name: "gmail:num_emails_sent", intValue: "3" }],
          },
        ],
        warnings: [{ code: "2001", message: "Invalid parameter ignored" }],
      });

    const result = await service().userUsage({
      userKey: "user-3@example.com",
      date: "2026-11-18",
      parameters: ["gmail:num_emails_sent", "drive:num_items_created"],
    });

    expect(scope.isDone()).toBe(true);
    expect(result.items[0].entityEmail).toBe("user-3@example.com");
    expect(result.warnings).toEqual([{ code: "2001", message: "Invalid parameter ignored" }]);
  });

  it("keeps nested message parameters as objects", async () => {
    nock("https://admin.googleapis.com")
      .get(entityUsagePath("gplus_communities", "all", "2026-11-18"))
      .query(true)
      .reply(200, {
        usageReports: [
          {
            date: "2026-11-18",
            entity: { type: "entity", entityId: "all" },
            parameters: [
              {
                name: "gplus:num_posts",
                msgValue: [{ key: "value", intValue: 4 }, { key: "empty" }],
              },
            ],
          },
        ],
      });

    const result = await service().entityUsage({
      entityType: "gplus_communities",
      entityKey: "all",
      date: "2026-11-18",
    });

    expect(result.items[0].parameters["gplus:num_posts"]).toEqual([
      { key: "value", intValue: 4 },
      { key: "empty" },
    ]);
  });
});

describe("reports registration", () => {
  it("registers every reports tool in read-only mode", () => {
    const reports = service();
    const { server } = buildServer({
      config: { ...loadConfig({ GWS_MODE: "readonly" }), tokenPath: "/tmp/t.json" },
      reports,
    });

    const registered = toolNames(server);
    for (const spec of reportsTools(reports)) {
      expect(registered, `${spec.name} must survive the read-only gate`).toContain(spec.name);
    }
  });

  it("keeps the reports surface read-only", () => {
    for (const spec of reportsTools(service())) {
      expect(spec.access, `${spec.name} must be read-only`).toBe("read");
      expect(spec.inputShape).not.toHaveProperty("confirm");
    }
  });
});

function toolNames(server: ReturnType<typeof buildServer>["server"]): string[] {
  const registry = (server as unknown as { _registeredTools?: Record<string, unknown> })
    ._registeredTools;
  return Object.keys(registry ?? {});
}
