# VietSage n8n workflows

Tracked workflow definitions only. Credentials, encryption keys, execution data, n8n database, and local `.env` files must remain outside Git.

## LocalMate Concierge AI

Workflow:

```text
workflows/vietsage-localmate-concierge.json
```

Validated with n8n `2.40.7`.

Local Docker runtime is managed by the root `docker-compose.yml` service `n8n`. Runtime settings and the existing instance encryption key live in ignored `secrets/docker/n8n.env`; the external volume `n8n-vietsage-test_n8n_vietsage_data` retains SQLite, workflows, users, and encrypted credentials.

Flow:

```text
Authenticated webhook
  -> normalize bounded guest input + require trusted hotel context
  -> private VietSage Knowledge API (hotel radius; backend-bounded results)
  -> grounded LocalMate model prompt
  -> minimal public chat response
```

Knowledge API URL is configured directly on the HTTP Request node because this
n8n instance blocks `$env` access inside workflow expressions. Both local and
production Compose provide the same internal service alias:

```text
http://auth-service:8080/localmate/knowledge
```

Local Docker maps `auth-service` to the host gateway; production resolves it on
the private Compose network. No workflow rewrite is required between environments.

Required n8n credentials:

| Credential name | Type | Purpose |
|---|---|---|
| `VietSage Chat Webhook Key` | Header Auth | Inbound `X-VietSage-Chat-Key` |
| `VietSage Knowledge Key` | Header Auth | Outbound `X-VietSage-Knowledge-Key` |
| `VietSage LocalMate Model V2` | OpenAI API | OpenAI-compatible model router |

The exported workflow stores credential references only. It does not contain credential values. After importing into another n8n instance, create/reselect the three credentials before publishing.

The OpenAI-compatible API key and base URL stay in the encrypted `VietSage LocalMate Model V2` credential. The model ID stays in node `06 · Sinh phản hồi LocalMate AI`. They are intentionally not container environment variables, and `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` prevents workflow code from reading runtime secrets.

The local container runs read-only with dropped capabilities, bounded resources, SSRF protection allowlisting only `host.docker.internal`, and community packages, templates, file-system nodes, and public API Swagger UI disabled. The public API itself remains enabled for authenticated MCP administration.

Import and publish:

```bash
n8n import:workflow --input=/path/to/vietsage-localmate-concierge.json
n8n publish:workflow --id=aeDgPC3ojuxfWbrY
```

Production first boot is intentionally manual at the credential boundary: create the owner through the loopback SSH tunnel, enable 2FA, create the three credentials above, import the tracked workflow, run a grounded test, then publish. This prevents API keys from entering Git, Compose, shell history, or container env.

The tracked artifact intentionally has `active: false`; import is non-activating. Configure/reselect credentials, run the checks below, then publish explicitly.

Before publishing, verify:

1. Missing/wrong chat key returns `403`.
2. Missing/wrong Knowledge key returns `401`.
3. Empty/invalid input returns `400`; a valid fast-path or grounded request returns `200`.
4. Correct request returns `status`, `reply`, `suggestions`, optional candidate `action` (`LOCALMATE_BOOKING`), `knowledgeVersion`, and `cached`.
5. Fast paths and fallback copy support `vi`, `en`, `zh`, `ko`, `ru`, and `hi`.
6. Grounded model output follows the strict JSON schema and reaches the formatter node.
7. `knowledgeVersion` starts with `sha256:` for grounded answers.
8. Response excludes tours, guides, prompt/context, credential values, cache keys, and session IDs. Model output addresses tours by title and duration, guides by fullName; technical tour codes (e.g. HVNT-xxxx) and guide codes stay excluded from guest-facing responses.
9. Successful execution payload retention stays disabled (`saveDataSuccessExecution: none`).
10. BFF sends the authenticated session's `hotelId`; n8n forwards `hotelId` and bounded `radiusKm` to the Knowledge API.
11. Grounding context keeps backend-provided `distanceKm` and `locationScope`; n8n does not fetch a full list or re-filter geography.
12. n8n forwards the full bounded guest question as `query`; destination detection and location filtering stay canonical in the backend. The hotel's province is a hard recommendation boundary, including for explicit destinations; n8n keeps no duplicate destination taxonomy.

Do not expose the n8n webhook or either secret to browser code. The frontend BFF authenticates the guest session, then calls n8n server-to-server.

## LocalMate Public Concierge

Workflow: `workflows/vietsage-localmate-public-concierge.json`.

```text
Authenticated webhook
  -> validate public message + stated location + bounded recent context
  -> ask for location when missing
  -> private VietSage Knowledge API (province bounded from stated location)
  -> no knowledge: deterministic clarification, no model call
  -> knowledge found: grounded LocalMate model prompt
  -> minimal public chat response
```

The browser calls only `/api/localmate/public-chat`. The BFF keeps the webhook key server-side and forwards the bounded location. This flow never accepts or invents a hotel context, never exposes credentials, and never returns a booking action.
