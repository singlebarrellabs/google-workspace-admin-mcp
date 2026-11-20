import type { OAuth2Client } from "google-auth-library";
import { type cloudsearch_v1, google } from "googleapis";
import { mapGoogleError, ToolError } from "../util/errors.js";

export interface SearchHit {
  title?: string;
  url?: string;
  snippet?: string;
  source?: string;
}

export interface SearchResult {
  items: SearchHit[];
  /** The API reports counts as strings. */
  totalSize?: string;
  /** Set when the query returned nothing and the tenant also has no sources. */
  noDataSources?: boolean;
  dataSources?: string[];
}

export interface SuggestResult {
  suggestions: string[];
}

export interface SourceRow {
  source?: string;
  displayName?: string;
  shortName?: string;
}

export interface QueryArgs {
  query: string;
  pageSize?: number;
  start?: number;
  sortBy?: string;
  searchApplicationId?: string;
}

const DEFAULT_SEARCH_APPLICATION = "searchapplications/default";

/**
 * Cloud Search wants a fully qualified search application id. A bare id is a
 * common input, and the API's own error for that is about the prefix rather
 * than the application, so it is normalised here.
 */
function searchApplicationId(value: string | undefined): string {
  const bare = value?.trim() || "default";
  return bare.startsWith("searchapplications/") ? bare : `searchapplications/${bare}`;
}

/**
 * Cloud Search. Enterprise and Education only; the error mapper already turns
 * an entitlement rejection on this surface into an edition error.
 */
export class CloudSearchService {
  private readonly client: cloudsearch_v1.Cloudsearch;

  constructor(auth: OAuth2Client) {
    this.client = google.cloudsearch({ version: "v1", auth });
  }

  async search(args: QueryArgs): Promise<SearchResult> {
    try {
      const response = await this.client.query.search({
        requestBody: {
          query: args.query,
          pageSize: args.pageSize ?? 20,
          start: args.start ?? 0,
          requestOptions: { searchApplicationId: searchApplicationId(args.searchApplicationId) },
          ...(args.sortBy ? { sortOptions: { operatorName: args.sortBy } } : {}),
        },
      });

      const body = response.data;
      const items = (body.results ?? []).map(toHit);

      if (items.length > 0) {
        const total = body.resultCountExact ?? body.resultCountEstimate;
        return {
          items,
          ...(total === undefined || total === null ? {} : { totalSize: total }),
        };
      }

      // No results can mean "nothing matched" or "this tenant has no data
      // sources at all". Those need different fixes, so ask before reporting.
      const sources = await this.listSources(args.searchApplicationId).catch(() => []);
      return {
        items,
        ...(sources.length === 0
          ? { noDataSources: true }
          : { dataSources: sources.map(sourceLabel) }),
      };
    } catch (error) {
      throw mapCloudSearchError(error);
    }
  }

  async suggest(query: string, applicationId?: string): Promise<SuggestResult> {
    try {
      const response = await this.client.query.suggest({
        requestBody: {
          query,
          requestOptions: { searchApplicationId: searchApplicationId(applicationId) },
        },
      });
      const suggestions = (response.data.suggestResults ?? [])
        .map((result) => result.suggestedQuery ?? "")
        .filter((suggestion) => suggestion.length > 0);
      return { suggestions };
    } catch (error) {
      throw mapCloudSearchError(error);
    }
  }

  async listSources(applicationId?: string): Promise<SourceRow[]> {
    try {
      const response = await this.client.query.sources.list({
        "requestOptions.searchApplicationId": searchApplicationId(applicationId),
      });
      return (response.data.sources ?? []).map((source) => ({
        ...(source.source?.name ? { source: source.source.name } : {}),
        ...(source.displayName ? { displayName: source.displayName } : {}),
        ...(source.shortName ? { shortName: source.shortName } : {}),
      }));
    } catch (error) {
      throw mapCloudSearchError(error);
    }
  }
}

/**
 * A tenant without Cloud Search enabled answers 403 "Cloud Search must be
 * enabled", which is a tenant setting rather than a missing admin role.
 */
function mapCloudSearchError(error: unknown): ToolError {
  const response = (error as { response?: { status?: number }; code?: number }).response;
  const status = response?.status ?? (error as { code?: number }).code;
  const message = (error as { message?: string }).message ?? "";

  if (status === 403 && /(must|not) be enabled/i.test(message)) {
    return new ToolError(
      "edition_unavailable",
      "Cloud Search is not enabled for this tenant.",
      "Enable Cloud Search in the Admin console under Apps → Additional Google services, then retry.",
    );
  }

  return mapGoogleError(error, "cloud-search");
}

function toHit(result: cloudsearch_v1.Schema$SearchResult): SearchHit {
  return {
    ...(result.title ? { title: result.title } : {}),
    ...(result.url ? { url: result.url } : {}),
    ...(result.snippet?.snippet ? { snippet: result.snippet.snippet } : {}),
  };
}

function sourceLabel(source: SourceRow): string {
  return source.displayName ?? source.shortName ?? source.source ?? "unknown source";
}
