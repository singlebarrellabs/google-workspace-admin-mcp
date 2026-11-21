# Tools

One row per tool. The table is filled in as surfaces land — a tool without a row
is a bug.

| Tool | Surface | Mutating | Notes |
| --- | --- | --- | --- |
| `gws_auth_status` | system | no | Credential state, token expiry, mode, scopes. |
| `gws_scopes_list` | system | no | The admin-only scopes this server requests. |
| `gws_users_list` | directory | no | Pages users; org unit becomes a query clause. |
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

## Conventions

- Names are `gws_<surface>_<verb>`, for example `gws_users_list`.
- `Mutating: yes` tools are absent when read-only mode is enabled.
- Destructive tools require an explicit confirm argument; the tool description
  states what becomes irreversible.
- Edition-restricted tools (Vault, Cloud Search) say so in their description.
