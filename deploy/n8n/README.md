# VietSage n8n workflows

Tracked workflow definitions only. Credentials, encryption keys, execution data, n8n database, and local `.env` files must remain outside Git.

## LocalMate Concierge AI

Workflow:

```text
workflows/vietsage-localmate-concierge.json
```

Validated with n8n `2.40.6`.

Flow:

```text
Authenticated webhook
  -> normalize bounded guest input
  -> private VietSage Knowledge API
  -> grounded LocalMate model prompt
  -> minimal public chat response
```

Knowledge API URL is configured directly on the HTTP Request node because this
n8n instance blocks `$env` access inside workflow expressions. The tracked
local-Docker value is:

```text
http://host.docker.internal:8080/localmate/knowledge
```

Change that node URL to `http://auth-service:8080/localmate/knowledge` when n8n
and `auth-service` share the same Docker Compose network.

Required n8n credentials:

| Credential name | Type | Purpose |
|---|---|---|
| `VietSage Chat Webhook Key` | Header Auth | Inbound `X-VietSage-Chat-Key` |
| `VietSage Knowledge Key` | Header Auth | Outbound `X-VietSage-Knowledge-Key` |
| `VietSage LocalMate Model V2` | OpenAI API | OpenAI-compatible model router |

The exported workflow stores credential references only. It does not contain credential values. After importing into another n8n instance, create/reselect the three credentials before publishing.

Import and publish:

```bash
n8n import:workflow --input=/path/to/vietsage-localmate-concierge.json
n8n publish:workflow --id=aeDgPC3ojuxfWbrY
```

The tracked artifact intentionally has `active: false`; import is non-activating. Configure/reselect credentials, run the checks below, then publish explicitly.

Before publishing, verify:

1. Missing/wrong chat key returns `403`.
2. Missing/wrong Knowledge key returns `401`.
3. Empty/invalid input returns `400`; a valid fast-path or grounded request returns `200`.
4. Correct request returns only `status`, `reply`, `suggestions`, `knowledgeVersion`, and `cached`.
5. Fast paths and fallback copy support `vi`, `en`, `zh`, `ko`, `ru`, and `hi`.
6. Grounded model output follows the strict JSON schema and reaches the formatter node.
7. `knowledgeVersion` starts with `sha256:` for grounded answers.
8. Response excludes tours, guides, prompt/context, credential values, cache keys, and session IDs.
9. Successful execution payload retention stays disabled (`saveDataSuccessExecution: none`).

Do not expose the n8n webhook or either secret to browser code. The frontend BFF authenticates the guest session, then calls n8n server-to-server.
