import { z } from "zod";
import type { ToolSpec } from "../../catalog.js";
import type { DomainsService } from "../../services/domains.js";

const domainShape = {
  domainName: z.string().min(1).describe("Domain, for example example.com"),
};

const aliasListShape = {
  parentDomainName: z.string().optional().describe("Only aliases of this domain"),
};

const aliasShape = {
  domainAliasName: z.string().min(1).describe("Domain alias, for example example.net"),
};

export function domainTools(service: DomainsService): ToolSpec[] {
  return [
    {
      name: "gws_domains_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description:
        "List the domains this tenant owns, with the primary flag and verification state.",
      inputShape: {},
      run: async () => {
        const domains = await service.listDomains();
        const primary = domains.find((domain) => domain.isPrimary)?.domainName;
        return {
          summary: `${domains.length} domain${domains.length === 1 ? "" : "s"}${
            primary ? `, primary ${primary}` : ""
          }`,
          data: { items: domains },
        };
      },
    },
    {
      name: "gws_domains_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one domain: primary and verification state, and when it was added.",
      inputShape: domainShape,
      run: async (input) => {
        const args = z.object(domainShape).parse(input);
        const domain = await service.getDomain(args.domainName);
        return {
          summary: `${domain.domainName}${domain.isPrimary ? " (primary)" : ""}${
            domain.verified === false ? ", unverified" : ""
          }`,
          data: domain,
        };
      },
    },
    {
      name: "gws_domain_aliases_list",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "List domain aliases, optionally limited to one parent domain.",
      inputShape: aliasListShape,
      run: async (input) => {
        const args = z.object(aliasListShape).parse(input);
        const aliases = await service.listDomainAliases(args.parentDomainName);
        return {
          summary: `${aliases.length} domain alias${aliases.length === 1 ? "" : "es"}`,
          data: { items: aliases },
        };
      },
    },
    {
      name: "gws_domain_aliases_get",
      surface: "directory",
      access: "read",
      edition: "all",
      description: "Get one domain alias and its parent domain.",
      inputShape: aliasShape,
      run: async (input) => {
        const args = z.object(aliasShape).parse(input);
        const alias = await service.getDomainAlias(args.domainAliasName);
        return {
          summary: `${alias.domainAliasName}${alias.parentDomainName ? ` for ${alias.parentDomainName}` : ""}`,
          data: alias,
        };
      },
    },
  ];
}
