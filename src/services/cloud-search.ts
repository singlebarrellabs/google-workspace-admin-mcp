import type { OAuth2Client } from "google-auth-library";
import { type cloudsearch_v1, google } from "googleapis";
import { mapGoogleError } from "../util/errors.js";

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
      const sources = await this.listSources().catch(() => []);
      return {
        items,
        ...(sources.length === 0
          ? { noDataSources: true }
          : { dataSources: sources.map(sourceLabel) }),
      };
    } catch (error) {
      throw mapGoogleError(error, "cloud-search");
    }
  }

  async suggest(query: string): Promise<SuggestResult> {
    try {
      const response = await this.client.query.suggest({ requestBody: { query } });
      const suggestions = (response.data.suggestResults ?? [])
        .map((result) => result.suggestedQuery ?? "")
        .filter((suggestion) => suggestion.length > 0);
      return { suggestions };
    } catch (error) {
      throw mapGoogleError(error, "cloud-search");
    }
  }

  async listSources(): Promise<SourceRow[]> {
    try {
      const response = await this.client.query.sources.list({});
      return (response.data.sources ?? []).map((source) => ({
        ...(source.source?.name ? { source: source.source.name } : {}),
        ...(source.displayName ? { displayName: source.displayName } : {}),
        ...(source.shortName ? { shortName: source.shortName } : {}),
      }));
    } catch (error) {
      throw mapGoogleError(error, "cloud-search");
    }
  }
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
