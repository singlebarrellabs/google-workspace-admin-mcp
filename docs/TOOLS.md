# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes, edition. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
| `gws_users_get` | directory | no | One user with org unit, suspension and login state. |
| `gws_users_create` | directory | yes | Never sets `isAdmin`; forces a password change. |
| `gws_users_update` | directory | yes | PATCH only; omitted fields keep their values. |
| `gws_users_suspend` | directory | yes | Destructive; needs `confirm: true`. |
| `gws_buildings_list` | resources | no | Buildings with address and floors. |
| `gws_buildings_get` | resources | no | One building. |
| `gws_buildings_create` | resources | yes | Rooms attach to an existing building. |
| `gws_buildings_update` | resources | yes | PATCH; other fields keep their values. |
| `gws_buildings_delete` | resources | yes | Destructive; rooms lose their building. |
| `gws_rooms_list` | resources | no | Rooms, filterable by building; features included. |
| `gws_rooms_get` | resources | no | One room with calendar address and capacity. |
| `gws_rooms_create` | resources | yes | Caller supplies resourceId; Google issues the email. |
| `gws_rooms_update` | resources | yes | PATCH; other fields keep their values. |
| `gws_rooms_delete` | resources | yes | Destructive; reports features removed with it. |
| `gws_features_list` | resources | no | Room features. |
| `gws_features_get` | resources | no | One feature. |
| `gws_features_create` | resources | yes | Rooms can then be tagged with it. |
| `gws_features_update` | resources | yes | Rename; rooms keep the feature. |
| `gws_features_delete` | resources | yes | Destructive; every tagged room loses it. |
| `gws_group_settings_get` | groups-settings | no | Grouped settings; unknown keys under `other`. |
| `gws_group_settings_update` | groups-settings | yes | Only supplied fields; bad names refused. |
| `gws_licenses_list` | licensing | no | Assignments by product, optionally by SKU. |
| `gws_licenses_get` | licensing | no | One assignment. |
| `gws_licenses_assign` | licensing | yes | Destructive; consumes a paid seat. |
| `gws_licenses_revoke` | licensing | yes | Destructive; product access ends now. |
| `gws_passthrough_directory` | directory | yes | Off by default; writes need write mode. |
| `gws_passthrough_reports` | reports | no | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_passthrough_vault` | vault | no | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_passthrough_transfer` | transfer | no | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_users_unsuspend` | directory | yes | Restores sign-in; sessions do not resume. |
| `gws_users_move` | directory | yes | Destructive; destination policies apply at once. |
| `gws_users_delete` | directory | yes | Destructive; restorable for 20 days. |
| `gws_users_undelete` | directory | yes | Restores a deleted user into an org unit. |
| `gws_aliases_list` | directory | no | A user's email aliases. |
| `gws_aliases_insert` | directory | yes | Adds an alias in an owned domain. |
| `gws_aliases_delete` | directory | yes | Mail to the alias bounces after this. |
| `gws_domains_list` | directory | no | Owned domains with primary and verified state. |
| `gws_domains_get` | directory | no | One domain. |
| `gws_domain_aliases_list` | directory | no | Domain aliases, optionally by parent domain. |
| `gws_domain_aliases_get` | directory | no | One domain alias. |
| `gws_groups_list` | directory | no | Pages groups; searchable. |
| `gws_groups_get` | directory | no | One group with member count and aliases. |
| `gws_groups_create` | directory | yes | Address must be in an owned domain. |
| `gws_groups_update` | directory | yes | PATCH; the other field keeps its value. |
| `gws_groups_delete` | directory | yes | Destructive; mail to the address stops. |
| `gws_members_list` | directory | no | Members, filterable by role. |
| `gws_members_get` | directory | no | One membership with role and status. |
| `gws_members_add` | directory | yes | Role is explicit; OWNER can manage the group. |
| `gws_members_remove` | directory | yes | The member's account is untouched. |
| `gws_orgunits_list` | directory | no | Whole tree, one level, or one unit. |
| `gws_orgunits_get` | directory | no | Path, parent and inheritance flag. |
| `gws_orgunits_create` | directory | yes | New unit starts on Google's defaults. |
| `gws_orgunits_update` | directory | yes | Reads first: the API has no partial update. |
| `gws_orgunits_delete` | directory | yes | Destructive; the unit must already be empty. |
| `gws_roles_list` | directory | no | Custom and system roles. |
| `gws_privileges_list` | directory | no | Privilege names a custom role can hold. |
| `gws_roles_create` | directory | yes | Custom role from an explicit privilege list. |
| `gws_roles_delete` | directory | yes | Destructive; unassigned custom roles only. |
| `gws_role_assignments_list` | directory | no | By user or by role. |
| `gws_role_assignments_create` | directory | yes | Grants real admin capability at once. |
| `gws_role_assignments_delete` | directory | yes | Destructive; privileges end immediately. |
| `gws_devices_mobile_list` | directory | no | Enrolled phones and tablets. |
| `gws_devices_mobile_get` | directory | no | One mobile device. |
| `gws_devices_mobile_action` | directory | yes | Destructive; wipes cannot be undone. |
| `gws_devices_chromeos_list` | directory | no | ChromeOS fleet with serial and org unit. |
| `gws_devices_chromeos_get` | directory | no | One ChromeOS device. |
| `gws_devices_chromeos_action` | directory | yes | Destructive; deprovision leaves management. |
| `gws_user_tokens_list` | directory | no | Third-party app grants and their scopes. |
| `gws_user_tokens_delete` | directory | yes | Destructive; the app must re-consent. |
| `gws_user_verification_codes_generate` | directory | yes | Destructive; supersedes the old set. |
| `gws_user_verification_codes_invalidate` | directory | yes | Destructive; may lock the user out. |
| `gws_user_sign_out` | directory | yes | Destructive; every session ends. |
| `gws_activities_list` | reports | no | Flat event rows; 7-day default range; 500-row cap. |
| `gws_usage_customer_get` | reports | no | Customer usage for one date; empty is not an error. |
| `gws_usage_user_get` | reports | no | Per-user usage with filters and org unit scope. |
| `gws_usage_entity_get` | reports | no | Entity usage for one type and key. |

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Passthrough is the one exception: one tool per API carries both read and write
  methods, so it stays registered and refuses write methods at call time while
  the server is read-only. Unlisted methods are rejected with the permitted list.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
