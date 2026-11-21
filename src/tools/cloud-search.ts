import { z } from "zod";
import type { ToolSpec } from "../catalog.js";
import type { CloudSearchService } from "../services/cloud-search.js";

const queryShape = {
  query: z.string().min(1).describe('Search query, for example "onboarding checklist"'),
  pageSize: z.number().int().min(1).max(100).optional().describe("Hits per page, default 20"),
  start: z.number().int().min(0).optional().describe("Offset into the result set, default 0"),
  sortBy: z.string().optional().describe("Sort operator name, when the source defines one"),
  searchApplicationId: z
    .string()
    .optional()
    .describe('Search application, default "searchapplications/default"'),
};

const suggestShape = {
  query: z.string().min(1).describe("Partial query to complete"),
  searchApplicationId: z
    .string()
    .optional()
    .describe('Search application, default "searchapplications/default"'),
};

export function cloudSearchTools(service: CloudSearchService): ToolSpec[] {
  return [
    {
      name: "gws_cloud_search_query",
      surface: "cloud-search",
      access: "read",
      edition: "enterprise",
      description:
        "Search the tenant's indexed content. Requires Enterprise or Education, where Cloud Search has data sources. When nothing matches, the result says whether the tenant has no data sources rather than leaving an empty list to interpret.",
      inputShape: queryShape,
      run: async (input) => {
        const args = z.object(queryShape).parse(input);
        const result = await service.search(args);
        if (result.noDataSources) {
          return {
            summary: "No results: this tenant has no Cloud Search data sources configured",
            data: result,
          };
        }
        return {
          summary: `${result.items.length} hit${result.items.length === 1 ? "" : "s"}${
            result.totalSize === undefined ? "" : ` of about ${result.totalSize}`
          }`,
          data: result,
        };
      },
    },
    {
      name: "gws_cloud_search_suggest",
      surface: "cloud-search",
      access: "read",
      edition: "enterprise",
      description:
        "Complete a partial query the way Cloud Search would for a user. Requires Enterprise or Education.",
      inputShape: suggestShape,
      run: async (input) => {
        const args = z.object(suggestShape).parse(input);
        const result = await service.suggest(args.query, args.searchApplicationId);
        return {
          summary: `${result.suggestions.length} suggestion${result.suggestions.length === 1 ? "" : "s"}`,
          data: result,
        };
      },
    },
    {
      name: "gws_cloud_search_sources_list",
      surface: "cloud-search",
      access: "read",
      edition: "enterprise",
      description:
        "List the data sources Cloud Search can query. An empty list explains every empty search result on the tenant.",
      inputShape: {
        searchApplicationId: z
          .string()
          .optional()
          .describe('Search application, default "searchapplications/default"'),
      },
      run: async (input) => {
        const args = z.object({ searchApplicationId: z.string().optional() }).parse(input ?? {});
        const sources = await service.listSources(args.searchApplicationId);
        return {
          summary: `${sources.length} data source${sources.length === 1 ? "" : "s"}`,
          data: { items: sources },
        };
      },
    },
  ];
}
