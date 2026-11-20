import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/auth/config.js";
import { buildServer } from "../src/server.js";
import { AlertsService } from "../src/services/alerts.js";
import { alertsTools } from "../src/tools/alerts.js";

function service(): AlertsService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new AlertsService(auth);
}

function alertPath(alertId: string): string {
  return `/v1beta1/alerts/${alertId}`;
}

afterEach(() => {
  nock.cleanAll();
});

describe("alerts listing", () => {
  it("returns a sparse alert without inventing the missing fields", async () => {
    nock("https://alertcenter.googleapis.com")
      .get("/v1beta1/alerts")
      .query((query) => {
        expect(query.pageSize).toBe("50");
        expect(query.orderBy).toBe("create_time desc");
        return true;
      })
      .reply(200, {
        alerts: [
          {
            alertId: "alert-1",
            type: "UserChanges",
            createTime: "2026-11-18T10:00:00.000Z",
            startTime: "2026-11-18T09:59:00.000Z",
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listAlerts({ orderBy: "create_time desc" });

    expect(result.nextPageToken).toBe("page-2");
    expect(result.items[0]).toEqual({
      alertId: "alert-1",
      type: "UserChanges",
      createTime: "2026-11-18T10:00:00.000Z",
      startTime: "2026-11-18T09:59:00.000Z",
    });
    expect(result.items[0]).not.toHaveProperty("metadata");
    expect(result.items[0]).not.toHaveProperty("source");
  });

  it("maps a 403 to permission_denied", async () => {
    nock("https://alertcenter.googleapis.com")
      .get("/v1beta1/alerts")
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Not Authorized", errors: [{ reason: "forbidden" }] },
      });

    await expect(service().listAlerts({})).rejects.toMatchObject({ category: "permission_denied" });
  });
});

describe("alerts retrieval", () => {
  it("returns metadata, the SIT link and the type-specific data", async () => {
    nock("https://alertcenter.googleapis.com")
      .get(alertPath("alert-2"))
      .query(true)
      .reply(200, {
        alertId: "alert-2",
        type: "Phishing",
        source: "Gmail phishing",
        securityInvestigationToolLink: "https://investigate.example/link",
        metadata: { severity: "HIGH", status: "IN_PROGRESS", assignee: "admin@example.com" },
        data: { messages: [{ subject: "Reset your password" }] },
      });

    const alert = await service().getAlert("alert-2");

    expect(alert.type).toBe("Phishing");
    expect(alert.metadata).toEqual({
      severity: "HIGH",
      status: "IN_PROGRESS",
      assignee: "admin@example.com",
    });
    expect(alert.securityInvestigationToolLink).toBe("https://investigate.example/link");
    expect(alert.data).toEqual({ messages: [{ subject: "Reset your password" }] });
  });

  it("maps a 404 to not_found", async () => {
    nock("https://alertcenter.googleapis.com")
      .get(alertPath("missing"))
      .query(true)
      .reply(404, { error: { code: 404, message: "Requested entity was not found." } });

    await expect(service().getAlert("missing")).rejects.toMatchObject({ category: "not_found" });
  });
});

describe("alerts feedback", () => {
  it("posts the feedback type and returns what was recorded", async () => {
    const scope = nock("https://alertcenter.googleapis.com")
      .post("/v1beta1/alerts/alert-3/feedback", { type: "VERY_USEFUL" })
      .query(true)
      .reply(200, {
        alertId: "alert-3",
        feedbackId: "feedback-1",
        type: "VERY_USEFUL",
        createTime: "2026-11-19T08:00:00.000Z",
      });

    const result = await service().createFeedback("alert-3", "VERY_USEFUL");

    expect(scope.isDone()).toBe(true);
    expect(result).toEqual({
      alertId: "alert-3",
      feedbackId: "feedback-1",
      type: "VERY_USEFUL",
      createTime: "2026-11-19T08:00:00.000Z",
    });
  });
});

describe("alerts delete and undelete", () => {
  it("marks an alert for deletion", async () => {
    const scope = nock("https://alertcenter.googleapis.com")
      .delete(alertPath("alert-4"))
      .query(true)
      .reply(200, {});

    const result = await service().deleteAlert("alert-4");

    expect(scope.isDone()).toBe(true);
    expect(result).toEqual({ alertId: "alert-4", markedForDeletion: true });
  });

  it("restores an alert through the undelete action", async () => {
    const scope = nock("https://alertcenter.googleapis.com")
      .post("/v1beta1/alerts/alert-5:undelete", {})
      .query(true)
      .reply(200, {});

    const result = await service().undeleteAlert("alert-5");

    expect(scope.isDone()).toBe(true);
    expect(result).toEqual({ alertId: "alert-5", restored: true });
  });
});

describe("alerts tool contracts", () => {
  it("states the retention consequence on delete and asks for confirmation", () => {
    const spec = alertsTools(service()).find((candidate) => candidate.name === "gws_alerts_delete");
    expect(spec).toBeDefined();
    expect(spec?.access).toBe("destructive");
    expect(spec?.description).toContain("purged after 30 days");
    expect(spec && "confirmNote" in spec ? spec.confirmNote : "").toContain("30 days");
  });

  it("keeps read tools registered in read-only mode and drops the mutating ones", () => {
    const alerts = service();
    const { server } = buildServer({
      config: { ...loadConfig({ GWS_MODE: "readonly" }), tokenPath: "/tmp/t.json" },
      alerts,
    });
    const registered = toolNames(server);

    expect(registered).toContain("gws_alerts_list");
    expect(registered).toContain("gws_alerts_get");
    expect(registered).not.toContain("gws_alerts_delete");
    expect(registered).not.toContain("gws_alerts_undelete");
    expect(registered).not.toContain("gws_alerts_feedback_create");
  });

  it("registers every alerts tool in write mode", () => {
    const alerts = service();
    const { server } = buildServer({
      config: { ...loadConfig({ GWS_MODE: "write" }), tokenPath: "/tmp/t.json" },
      alerts,
    });
    const registered = toolNames(server);

    for (const spec of alertsTools(alerts)) expect(registered).toContain(spec.name);
  });
});

function toolNames(server: ReturnType<typeof buildServer>["server"]): string[] {
  const registry = (server as unknown as { _registeredTools?: Record<string, unknown> })
    ._registeredTools;
  return Object.keys(registry ?? {});
}
