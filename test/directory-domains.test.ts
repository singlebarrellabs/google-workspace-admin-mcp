import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { DomainsService } from "../src/services/domains.js";

function service(): DomainsService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new DomainsService(auth);
}

const domainsPath = "/admin/directory/v1/customer/my_customer/domains";
const aliasesPath = "/admin/directory/v1/customer/my_customer/domainaliases";

afterEach(() => {
  nock.cleanAll();
});

describe("domains", () => {
  it("lists domains and keeps the primary flag", async () => {
    nock("https://admin.googleapis.com")
      .get(domainsPath)
      .query(true)
      .reply(200, {
        domains: [
          { domainName: "example.com", isPrimary: true, verified: true },
          { domainName: "example.org", isPrimary: false, verified: false },
        ],
      });

    const domains = await service().listDomains();

    expect(domains).toHaveLength(2);
    expect(domains[0]).toEqual({
      domainName: "example.com",
      isPrimary: true,
      verified: true,
    });
  });

  it("gets one domain", async () => {
    nock("https://admin.googleapis.com").get(`${domainsPath}/example.com`).query(true).reply(200, {
      domainName: "example.com",
      isPrimary: true,
      verified: true,
      creationTime: "2024-01-01T00:00:00.000Z",
    });

    const domain = await service().getDomain("example.com");

    expect(domain.creationTime).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("domain aliases", () => {
  it("lists aliases and optionally scopes them to a parent domain", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(aliasesPath)
      .query((query) => {
        expect(query.parentDomainName).toBe("example.com");
        return true;
      })
      .reply(200, {
        domainAliases: [
          { domainAliasName: "example.net", parentDomainName: "example.com", verified: true },
        ],
      });

    const aliases = await service().listDomainAliases("example.com");

    expect(scope.isDone()).toBe(true);
    expect(aliases[0].domainAliasName).toBe("example.net");
  });

  it("gets one alias", async () => {
    nock("https://admin.googleapis.com").get(`${aliasesPath}/example.net`).query(true).reply(200, {
      domainAliasName: "example.net",
      parentDomainName: "example.com",
      verified: true,
    });

    const alias = await service().getDomainAlias("example.net");

    expect(alias.parentDomainName).toBe("example.com");
  });

  it("maps a 404 to not_found", async () => {
    nock("https://admin.googleapis.com")
      .get(`${aliasesPath}/missing.example`)
      .query(true)
      .reply(404, { error: { code: 404, message: "Domain alias does not exist." } });

    await expect(service().getDomainAlias("missing.example")).rejects.toMatchObject({
      category: "not_found",
    });
  });
});
