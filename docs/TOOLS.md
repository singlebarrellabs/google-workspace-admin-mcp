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
| `gws_activities_list` | reports | no | Flat event rows; 7-day default range; 500-row cap. |
| `gws_usage_customer_get` | reports | no | Customer usage for one date; empty is not an error. |
| `gws_usage_user_get` | reports | no | Per-user usage with filters and org unit scope. |
| `gws_usage_entity_get` | reports | no | Entity usage for one type and key. |

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
