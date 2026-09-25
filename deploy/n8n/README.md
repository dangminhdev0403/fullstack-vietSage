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

Required runtime environment:

```dotenv
LOCALMATE_KNOWLEDGE_URL=http://auth-service:8080/localmate/knowledge
```

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
3. Correct request returns `200` with only `status`, `reply`, `suggestions` when present, `knowledgeVersion`, and `cached`.
4. `knowledgeVersion` starts with `sha256:` for grounded answers.
5. Response excludes tours, guides, prompt/context, credential values, cache keys, and session IDs.

Do not expose the n8n webhook or either secret to browser code. The frontend BFF authenticates the guest session, then calls n8n server-to-server.
