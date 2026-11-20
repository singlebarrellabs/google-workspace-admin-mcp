# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
| `gws_users_suspend` | directory | yes | Destructive; needs `confirm: true`. |
| `gws_passthrough_directory` | directory | read/write | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_passthrough_reports` | reports | read | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_passthrough_alerts` | alerts | read | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_passthrough_vault` | vault | read | Off unless `GWS_PASSTHROUGH=on`. |
| `gws_passthrough_transfer` | transfer | read | Off unless `GWS_PASSTHROUGH=on`. |

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Passthrough is the one exception: one tool per API carries both read and write
  methods, so it stays registered and refuses write methods at call time while
  the server is read-only. Unlisted methods are rejected with the permitted list.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
