# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
| `gws_users_suspend` | directory | yes | Destructive; needs `confirm: true`. |
| `gws_licenses_list` | licensing | no | Assignments by product, optionally by SKU. |
| `gws_licenses_get` | licensing | no | One assignment. |
| `gws_licenses_assign` | licensing | yes | Destructive; consumes a paid seat. |
| `gws_licenses_revoke` | licensing | yes | Destructive; product access ends now. |

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
