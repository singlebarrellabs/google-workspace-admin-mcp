import type { AnyToolSpec } from "../catalog.js";
import type { DevicesService } from "../services/devices.js";
import type { DirectoryService } from "../services/directory.js";
import type { GroupsService } from "../services/directory-groups.js";
import type { DomainsService } from "../services/domains.js";
import type { OrgUnitsService } from "../services/orgunits.js";
import type { RolesService } from "../services/roles.js";
import type { UserSecurityService } from "../services/user-security.js";
import { deviceTools } from "./directory/devices.js";
import { domainTools } from "./directory/domains.js";
import { groupTools } from "./directory/groups.js";
import { orgUnitTools } from "./directory/orgunits.js";
import { roleTools } from "./directory/roles.js";
import { userSecurityTools } from "./directory/user-security.js";
import { userTools } from "./directory/users.js";

export interface DirectoryServices {
  users: DirectoryService;
  domains: DomainsService;
  groups: GroupsService;
  orgUnits: OrgUnitsService;
  roles: RolesService;
  devices: DevicesService;
  userSecurity: UserSecurityService;
}

/**
 * The directory surface is split by resource so each file stays readable; the
 * server still registers one surface.
 */
export function directoryTools(services: DirectoryServices): AnyToolSpec[] {
  return [
    ...userTools(services.users),
    ...domainTools(services.domains),
    ...groupTools(services.groups),
    ...orgUnitTools(services.orgUnits),
    ...roleTools(services.roles),
    ...deviceTools(services.devices),
    ...userSecurityTools(services.userSecurity),
  ];
}
