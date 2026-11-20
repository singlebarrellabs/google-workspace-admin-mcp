import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { CloudSearchService } from "../src/services/cloud-search.js";

function service(): CloudSearchService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new CloudSearchService(auth);
}

afterEach(() => {
  nock.cleanAll();
});

describe("cloud search query", () => {
  it("returns hits with snippet text and the exact count", async () => {
    const scope = nock("https://cloudsearch.googleapis.com")
      .post("/v1/query/search", (body) => {
        expect(body).toMatchObject({ query: "onboarding", pageSize: 20, start: 0 });
        return true;
      })
      .query(true)
      .reply(200, {
        results: [
          {
            title: "Onboarding checklist",
            url: "https://example.com/doc",
            snippet: { snippet: "Steps for a new starter" },
          },
        ],
        resultCountExact: "1",
      });

    const result = await service().search({ query: "onboarding" });

    expect(scope.isDone()).toBe(true);
    expect(result.items).toEqual([
      {
        title: "Onboarding checklist",
        url: "https://example.com/doc",
        snippet: "Steps for a new starter",
      },
    ]);
    expect(result.totalSize).toBe("1");
  });

  it("passes a sort operator when asked", async () => {
    const scope = nock("https://cloudsearch.googleapis.com")
      .post("/v1/query/search", (body) => {
        expect(body.sortOptions).toEqual({ operatorName: "relevance" });
        return true;
      })
      .query(true)
      .reply(200, { results: [{ title: "Hit" }] });

    await service().search({ query: "policy", sortBy: "relevance" });

    expect(scope.isDone()).toBe(true);
  });

  it("says the tenant has no data sources when nothing matches and none exist", async () => {
    nock("https://cloudsearch.googleapis.com")
      .post("/v1/query/search")
      .query(true)
      .reply(200, { results: [] });
    nock("https://cloudsearch.googleapis.com")
      .get("/v1/query/sources")
      .query(true)
      .reply(200, { sources: [] });

    const result = await service().search({ query: "anything" });

    expect(result.items).toEqual([]);
    expect(result.noDataSources).toBe(true);
  });

  it("reports the configured sources when a query simply matched nothing", async () => {
    nock("https://cloudsearch.googleapis.com")
      .post("/v1/query/search")
      .query(true)
      .reply(200, { results: [] });
    nock("https://cloudsearch.googleapis.com")
      .get("/v1/query/sources")
      .query(true)
      .reply(200, {
        sources: [{ source: { name: "datasources/drive" }, displayName: "Drive" }],
      });

    const result = await service().search({ query: "zzz" });

    expect(result.noDataSources).toBeUndefined();
    expect(result.dataSources).toEqual(["Drive"]);
  });

  it("maps an entitlement rejection to edition_unavailable", async () => {
    nock("https://cloudsearch.googleapis.com")
      .post("/v1/query/search")
      .query(true)
      .reply(403, {
        error: { code: 403, message: "Cloud Search is not available for your edition" },
      });

    await expect(service().search({ query: "x" })).rejects.toMatchObject({
      category: "edition_unavailable",
    });
  });
});

describe("cloud search suggest and sources", () => {
  it("returns the suggested queries", async () => {
    nock("https://cloudsearch.googleapis.com")
      .post("/v1/query/suggest", (body) => {
        expect(body).toMatchObject({
          query: "onbo",
          requestOptions: { searchApplicationId: "searchapplications/default" },
        });
        return true;
      })
      .query(true)
      .reply(200, {
        suggestResults: [
          { suggestedQuery: "onboarding" },
          { suggestedQuery: "onboarding checklist" },
        ],
      });

    const result = await service().suggest("onbo");

    expect(result.suggestions).toEqual(["onboarding", "onboarding checklist"]);
  });

  it("normalises a bare search application id and defaults it", async () => {
    const bare = nock("https://cloudsearch.googleapis.com")
      .get("/v1/query/sources")
      .query((query) => {
        expect(query["requestOptions.searchApplicationId"]).toBe("searchapplications/team");
        return true;
      })
      .reply(200, { sources: [] });

    await service().listSources("team");

    expect(bare.isDone()).toBe(true);
  });

  it("reports a tenant with Cloud Search disabled as edition_unavailable", async () => {
    nock("https://cloudsearch.googleapis.com")
      .get("/v1/query/sources")
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: "Cloud Search must be enabled to use this API.",
        },
      });

    const error = await service()
      .listSources()
      .catch((caught: unknown) => caught as { category: string; nextStep?: string });

    expect(error.category).toBe("edition_unavailable");
    expect(error.nextStep).toContain("Admin console");
  });

  it("lists sources with their display names", async () => {
    nock("https://cloudsearch.googleapis.com")
      .get("/v1/query/sources")
      .query(true)
      .reply(200, {
        sources: [
          { source: { name: "datasources/drive" }, displayName: "Drive", shortName: "drive" },
          { source: { name: "datasources/gmail" }, displayName: "Gmail" },
        ],
      });

    const sources = await service().listSources();

    expect(sources).toEqual([
      { source: "datasources/drive", displayName: "Drive", shortName: "drive" },
      { source: "datasources/gmail", displayName: "Gmail" },
    ]);
  });
});
