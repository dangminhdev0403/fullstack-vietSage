# VietSage biometric bridge

Local-only companion between the VietSage browser, HN-212 plugin, and SenseFace.

```text
VPS VietSage HTTPS -> browser on reception PC -> HTTPS 127.0.0.1 bridge
bridge -> ws://localhost:8000 HN212Plugin
bridge -> SenseFace TCP 4370 + HTTPS PUSH 18081
```

The VPS never connects to `192.168.55.11`. A scan stays in RAM and does not create a device user or queue a face until `POST /enrollments` is called after the stay API succeeds. Pending scans expire after 30 minutes by default.

## Run on Windows

Set the SenseFace communication key only in the local environment:

```bash
export ZK_COMM_KEY='<local-communication-key>'
python bridge_app.py \
  --api-listen 127.0.0.1 --api-port 18080 \
  --api-cert '<trusted-local-api.crt>' --api-key '<trusted-local-api.key>' \
  --allowed-origin 'https://your-vietsage.example' \
  --push-listen 192.168.55.10 --push-port 18081 \
  --push-cert '<senseface-push.crt>' --push-key '<senseface-push.key>'
```

For localhost development only, omit `--api-cert/--api-key`; defaults allow `http://localhost:3000` and `http://127.0.0.1:3000`. Production VietSage is HTTPS, therefore the local API certificate must be trusted by the reception PC. Certificate installation is an operator step, not performed by this tool.

Runtime certificates, keys, scans, portraits, and profiles are ignored by Git. Do not store them in the repository.

## Browser API

- `GET /health`
- `POST /scans/start`
- `GET /scans/{scanId}`
- `POST /enrollments` with `{ "stayId": "...", "scanId": "..." }`
- `GET /enrollments/{requestId}`
- `POST /enrollments/{requestId}/retry`

Enrollment states: `PENDING`, `SYNCED`, `FAILED`. Responses mask the identity number. Duplicate enrollment by the same `stayId` returns the original request and does not queue another face.

## Test

```bash
python -m unittest -v test_biometric_api.py test_push_receiver.py test_zkteco_bridge.py
python -m py_compile bridge_app.py biometric_api.py hn212_client.py push_receiver.py zkteco_bridge.py
```
