import type { AnyToolSpec } from "../catalog.js";
import type { DirectoryService } from "../services/directory.js";
import type { DomainsService } from "../services/domains.js";
import { domainTools } from "./directory/domains.js";
import { userTools } from "./directory/users.js";

/**
 * The directory surface is split by resource so each file stays readable; the
 * server still registers one surface.
 */
export function directoryTools(
  service: DirectoryService,
  domains: DomainsService,
): Array<AnyToolSpec> {
  return [...userTools(service), ...domainTools(domains)];
}
