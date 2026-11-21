import type { OAuth2Client } from "google-auth-library";
import { type admin_directory_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

export interface DomainRow {
  domainName: string;
  isPrimary?: boolean;
  verified?: boolean;
  creationTime?: string;
}

export interface DomainAliasRow {
  domainAliasName: string;
  parentDomainName?: string;
  verified?: boolean;
  creationTime?: string;
}

/**
 * Domains and domain aliases. Read-only: adding or removing a domain is a
 * verification workflow in the admin console, not something to expose as a
 * single API call.
 */
export class DomainsService {
  private readonly client: admin_directory_v1.Admin;

  constructor(auth: OAuth2Client) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  async listDomains(): Promise<DomainRow[]> {
    try {
      const response = await this.client.domains.list({ customer: "my_customer" });
      return (response.data.domains ?? []).map(toDomainRow);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getDomain(domainName: string): Promise<DomainRow> {
    try {
      const response = await this.client.domains.get({ customer: "my_customer", domainName });
      return toDomainRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async listDomainAliases(parentDomainName?: string): Promise<DomainAliasRow[]> {
    try {
      const response = await this.client.domainAliases.list({
        customer: "my_customer",
        ...(parentDomainName ? { parentDomainName } : {}),
      });
      return (response.data.domainAliases ?? []).map(toDomainAliasRow);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }

  async getDomainAlias(domainAliasName: string): Promise<DomainAliasRow> {
    try {
      const response = await this.client.domainAliases.get({
        customer: "my_customer",
        domainAliasName,
      });
      return toDomainAliasRow(response.data);
    } catch (error) {
      throw mapGoogleError(error, "directory");
    }
  }
}

function toDomainRow(domain: admin_directory_v1.Schema$Domains): DomainRow {
  return {
    domainName: domain.domainName ?? "",
    ...(domain.isPrimary === undefined || domain.isPrimary === null
      ? {}
      : { isPrimary: domain.isPrimary }),
    ...(domain.verified === undefined || domain.verified === null
      ? {}
      : { verified: domain.verified }),
    ...(domain.creationTime ? { creationTime: domain.creationTime } : {}),
  };
}

function toDomainAliasRow(alias: admin_directory_v1.Schema$DomainAlias): DomainAliasRow {
  return {
    domainAliasName: alias.domainAliasName ?? "",
    ...(alias.parentDomainName ? { parentDomainName: alias.parentDomainName } : {}),
    ...(alias.verified === undefined || alias.verified === null
      ? {}
      : { verified: alias.verified }),
    ...(alias.creationTime ? { creationTime: alias.creationTime } : {}),
  };
}
