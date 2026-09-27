# VietSage runtime secrets

Real secret files in this directory are machine-local and ignored by Git.

## Local Docker

- `docker/postgres.env`
- `docker/auth-service.env`
- `docker/frontend.env`
- `docker/n8n.env`

`docker/n8n.env` owns n8n runtime settings and the existing instance encryption key. Never replace `N8N_ENCRYPTION_KEY` with a newly generated value: the current SQLite credentials were encrypted with that exact key.

The LocalMate provider API key and base URL remain in n8n's encrypted credential `VietSage LocalMate Model V2`. The model ID remains in workflow node `06 · Sinh phản hồi LocalMate AI`. They are intentionally not copied into container environment variables.

Start or reconcile n8n with:

```bash
docker compose up -d --no-deps n8n
```

Before changing the encryption key or volume, back up both `docker/n8n.env` and the external volume `n8n-vietsage-test_n8n_vietsage_data`.

See `../docs/SECRETS.md` and `../deploy/n8n/README.md`.
