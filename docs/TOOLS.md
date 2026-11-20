# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
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

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
