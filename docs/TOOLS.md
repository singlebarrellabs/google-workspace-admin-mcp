# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
| `gws_users_suspend` | directory | yes | Destructive; needs `confirm: true`. |
| `gws_vault_matters_list` | vault | no | Filter by state; `view: FULL` shows permissions. |
| `gws_vault_matters_get` | vault | no | One matter, optionally with permissions. |
| `gws_vault_matters_create` | vault | yes | Optional data region. |
| `gws_vault_matters_update` | vault | yes | Read then PUT; region preserved. |
| `gws_vault_matters_close` | vault | yes | Reopen is allowed. |
| `gws_vault_matters_reopen` | vault | yes | Reopens a closed matter. |
| `gws_vault_matters_delete` | vault | yes | Destructive; restorable for 30 days. |
| `gws_vault_matters_undelete` | vault | yes | Inside Google's 30-day window. |
| `gws_vault_holds_list` | vault | no | Holds with corpus and scope. |
| `gws_vault_holds_get` | vault | no | One hold and its query. |
| `gws_vault_holds_create` | vault | yes | Query options must match the corpus. |
| `gws_vault_holds_update` | vault | yes | Read then PUT; corpus drives the query. |
| `gws_vault_holds_delete` | vault | yes | Destructive; data stops being preserved. |
| `gws_vault_holds_add_accounts` | vault | yes | By email or Admin SDK id. |
| `gws_vault_holds_remove_accounts` | vault | yes | Destructive; names each account released. |
| `gws_vault_saved_queries_list` | vault | no | Saved searches in a matter. |
| `gws_vault_saved_queries_get` | vault | no | One saved query. |
| `gws_vault_saved_queries_create` | vault | yes | Corpus and terms become a Query. |
| `gws_vault_saved_queries_delete` | vault | yes | Definition only; recreatable. |
| `gws_vault_exports_list` | vault | no | Export status per matter. |
| `gws_vault_exports_get` | vault | no | Status, progress and sink. |
| `gws_vault_exports_create` | vault | yes | Destructive; asynchronous job. |
| `gws_vault_exports_delete` | vault | yes | Destructive; files stay in the sink. |
| `gws_vault_exports_wait` | vault | no | Polls status within a budget. |
| `gws_vault_matters_count` | vault | no | Starts a count; returns its operation. |
| `gws_vault_operations_wait` | vault | no | Polls a long-running operation. |

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
