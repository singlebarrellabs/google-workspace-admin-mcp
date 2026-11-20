# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
| `gws_users_suspend` | directory | yes | Destructive; needs `confirm: true`. |
| `gws_alerts_list` | alerts | no | Google's own signals; filter, order and page token. |
| `gws_alerts_get` | alerts | no | One alert with type data, severity and SIT link. |
| `gws_alerts_feedback_create` | alerts | yes | Records alert usefulness. |
| `gws_alerts_delete` | alerts | yes | Destructive; hidden now, purged after 30 days. |
| `gws_alerts_undelete` | alerts | yes | Destructive; restores within the 30-day window. |

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
