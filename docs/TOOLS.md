# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
| `gws_users_suspend` | directory | yes | Destructive; needs `confirm: true`. |
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
