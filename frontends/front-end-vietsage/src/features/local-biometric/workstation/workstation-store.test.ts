import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires explicit extension.
import { acceptsRecognitionBodyLength, recognitionRelayAvailable } from "./workstation-auth.ts";
// @ts-expect-error Node strip-types requires explicit extension.
import { WorkstationStore } from "./workstation-store.ts";

const result = {
  schemaVersion: 1 as const,
  transferId: "33333333-3333-4333-8333-333333333333",
  capturedAt: "2026-07-31T03:00:00.000Z",
  guest: { displayName: "Nguyễn Văn A", identityNumber: "001234567890" },
  verification: { chipAuthenticated: true, sodVerified: true },
};

test("pair once then receive and complete one scan command", () => {
  const store = new WorkstationStore(() => 1_000, () => "secret");
  const pairing = store.issuePairing("hotel-1", "operator-1");
  const workstation = store.pair(pairing.code);
  assert.ok(workstation);
  const scan = store.requestScan("hotel-1", "operator-1");
  assert.equal(store.poll(workstation!.token)?.scanRequestId, scan.scanRequestId);
  assert.equal(store.poll(workstation!.token)?.scanRequestId, scan.scanRequestId);
  assert.equal(store.complete(workstation!.token, scan.scanRequestId, result), true);
  assert.equal(store.poll(workstation!.token), null);
  const readResult = store.readScan(scan.scanRequestId, "hotel-1", "operator-1");
  assert.equal(readResult?.payload?.guest.identityNumber, "001234567890");
  assert.equal(readResult?.status, "received");
});

test("wrong hotel cannot read or complete scan", () => {
  const secrets = ["pair-1", "token-1", "pair-2", "token-2"];
  const store = new WorkstationStore(() => 1_000, () => secrets.shift()!);
  const workstation = store.pair(store.issuePairing("hotel-1", "operator-1").code)!;
  const scan = store.requestScan("hotel-1", "operator-1");
  assert.equal(store.readScan(scan.scanRequestId, "hotel-2", "operator-1"), null);
  const other = store.pair(store.issuePairing("hotel-2", "operator-2").code)!;
  assert.equal(store.poll(workstation.token)?.scanRequestId, scan.scanRequestId);
  assert.equal(store.complete(other.token, scan.scanRequestId, result), false);
  assert.equal(store.complete(workstation.token, scan.scanRequestId, result), true);
});

test("one workstation claims a scan command", () => {
  const secrets = ["pair-1", "token-1", "pair-2", "token-2"];
  const store = new WorkstationStore(() => 1_000, () => secrets.shift()!);
  const first = store.pair(store.issuePairing("hotel-1", "operator-1").code)!;
  const second = store.pair(store.issuePairing("hotel-1", "operator-1").code)!;
  const scan = store.requestScan("hotel-1", "operator-1");
  assert.equal(store.poll(first.token)?.scanRequestId, scan.scanRequestId);
  assert.equal(store.poll(first.token)?.scanRequestId, scan.scanRequestId);
  assert.equal(store.poll(second.token), null);
  assert.equal(store.complete(second.token, scan.scanRequestId, result), false);
  assert.equal(store.complete(first.token, scan.scanRequestId, result), true);
});

test("persistent workstation claim stays isolated between two workstations at one hotel", () => {
  const store = new WorkstationStore(() => 1_000);
  const scan = store.requestScan("hotel-1", "operator-1");

  assert.equal(store.pollWorkstation("hotel-1", "station-a")?.scanRequestId, scan.scanRequestId);
  assert.equal(store.pollWorkstation("hotel-1", "station-b"), null);
  assert.equal(store.completeWorkstation("hotel-1", "station-b", scan.scanRequestId, result), false);
  assert.equal(store.completeWorkstation("hotel-1", "station-a", scan.scanRequestId, result), true);
});

test("expired pairing, scan, and workstation token are rejected", () => {
  let now = 1_000;
  const secrets = ["pair-expired", "pair-live", "token-live"];
  const store = new WorkstationStore(() => now, () => secrets.shift()!);
  const expiredPairing = store.issuePairing("hotel-1", "operator-1", 300);
  now = expiredPairing.expiresAt;
  assert.equal(store.pair(expiredPairing.code), null);

  const workstation = store.pair(store.issuePairing("hotel-1", "operator-1").code, 60)!;
  const scan = store.requestScan("hotel-1", "operator-1");
  now += 60_000;
  assert.equal(store.poll(workstation.token), null);
  assert.equal(store.complete(workstation.token, scan.scanRequestId, result), false);
});

test("ACK deletes payload from store", () => {
  const store = new WorkstationStore(() => 1_000, () => "secret2");
  const pairing = store.issuePairing("hotel-1", "operator-1");
  const workstation = store.pair(pairing.code);
  const scan = store.requestScan("hotel-1", "operator-1");
  store.poll(workstation!.token);
  store.complete(workstation!.token, scan.scanRequestId, result);
  
  assert.ok(store.readScan(scan.scanRequestId, "hotel-1", "operator-1")?.payload);
  assert.equal(store.acknowledgeScan(scan.scanRequestId, "hotel-1", "operator-1"), true);
  
  const readAfterAck = store.readScan(scan.scanRequestId, "hotel-1", "operator-1");
  assert.equal(readAfterAck, null); // readScan returns null for acknowledged scans
});

test("Discard clears payload", () => {
  const store = new WorkstationStore(() => 1_000, () => "secret3");
  const pairing = store.issuePairing("hotel-1", "operator-1");
  const workstation = store.pair(pairing.code);
  const scan = store.requestScan("hotel-1", "operator-1");
  store.poll(workstation!.token);
  store.complete(workstation!.token, scan.scanRequestId, result);
  
  assert.equal(store.discardScan(scan.scanRequestId, "hotel-1", "operator-1"), true);
  const readAfterDiscard = store.readScan(scan.scanRequestId, "hotel-1", "operator-1");
  assert.equal(readAfterDiscard, null);
});

test("ACK or discard cannot be bypassed by completing the same scan again", () => {
  const store = new WorkstationStore(() => 1_000, () => crypto.randomUUID());
  const workstation = store.pair(store.issuePairing("hotel-1", "operator-1").code)!;

  const acknowledged = store.requestScan("hotel-1", "operator-1");
  store.poll(workstation.token);
  assert.equal(store.complete(workstation.token, acknowledged.scanRequestId, result), true);
  assert.equal(store.acknowledgeScan(acknowledged.scanRequestId, "hotel-1", "operator-1"), true);
  assert.equal(store.complete(workstation.token, acknowledged.scanRequestId, result), false);

  const discarded = store.requestScan("hotel-1", "operator-1");
  store.poll(workstation.token);
  assert.equal(store.discardScan(discarded.scanRequestId, "hotel-1", "operator-1"), true);
  assert.equal(store.complete(workstation.token, discarded.scanRequestId, result), false);
});

test("Wrong hotel/operator cannot ACK", () => {
  const store = new WorkstationStore(() => 1_000, () => "secret4");
  const pairing = store.issuePairing("hotel-1", "operator-1");
  const workstation = store.pair(pairing.code);
  const scan = store.requestScan("hotel-1", "operator-1");
  store.poll(workstation!.token);
  store.complete(workstation!.token, scan.scanRequestId, result);
  
  assert.equal(store.acknowledgeScan(scan.scanRequestId, "hotel-2", "operator-1"), false);
  assert.equal(store.acknowledgeScan(scan.scanRequestId, "hotel-1", "operator-2"), false);
});

test("TTL cleanup removes expired entries", () => {
  let now = 1_000;
  const store = new WorkstationStore(() => now, () => crypto.randomUUID());
  store.issuePairing("hotel-1", "operator-1", 300); // expires at 301,000
  store.requestScan("hotel-1", "operator-1", 60); // expires at 61,000
  
  assert.equal(store.cleanupExpired(), 0);
  
  now = 100_000;
  assert.equal(store.cleanupExpired(), 1); // scan expired
  
  now = 400_000;
  assert.equal(store.cleanupExpired(), 1); // pairing expired
});

test("disconnect revokes only the selected hotel's workstation credentials", () => {
  const secrets = ["pair-1", "token-1", "pair-2", "token-2"];
  const store = new WorkstationStore(() => 1_000, () => secrets.shift()!);
  const first = store.pair(store.issuePairing("hotel-1", "operator-1").code)!;
  const second = store.pair(store.issuePairing("hotel-2", "operator-2").code)!;

  assert.equal(store.disconnectHotel("hotel-1"), 1);
  assert.equal(store.poll(first.token), null);
  assert.equal(store.hasOnlineWorkstation("hotel-1"), false);
  assert.equal(store.poll(second.token), null);
  assert.equal(store.hasOnlineWorkstation("hotel-2"), true);
});

test("hot reload can upgrade an existing workstation store instance", () => {
  const store = new WorkstationStore();
  Object.setPrototypeOf(store, {});
  assert.equal(typeof store.disconnectHotel, "undefined");
  Object.setPrototypeOf(store, WorkstationStore.prototype);
  assert.equal(typeof store.disconnectHotel, "function");
});

test("recognition hotel is derived from workstation token and duplicate is idempotent", () => {
  const secrets = ["pair-a", "token-a", "pair-b", "token-b"];
  const store = new WorkstationStore(() => 1_000, () => secrets.shift()!);
  const a = store.pair(store.issuePairing("hotel-a", "operator-a").code)!;
  store.pair(store.issuePairing("hotel-b", "operator-b").code)!;
  const payload = {
    providerEventId: "event-1", deviceId: "senseface-1", deviceUserId: "900000001",
    occurredAt: "2026-08-01T10:00:00.000Z", sourceTable: "ATTLOG", verifyType: "255", eventCode: "1",
    deviceIndex: "7", inOutStatus: "0",
  };
  assert.deepEqual(store.ingestRecognition(a.token, payload), { accepted: true, duplicate: false });
  assert.deepEqual(store.ingestRecognition(a.token, payload), { accepted: true, duplicate: true });
  assert.equal(store.listRecognitions("hotel-a").length, 1);
  assert.equal(store.listRecognitions("hotel-b").length, 0);
  assert.equal(store.listRecognitions("hotel-a")[0]?.hotelId, "hotel-a");
  assert.equal(store.listRecognitions("hotel-a")[0]?.deviceIndex, "7");
  assert.equal(store.listRecognitions("hotel-a")[0]?.inOutStatus, "0");
});

test("unknown or expired workstation cannot ingest recognition", () => {
  let now = 1_000;
  const store = new WorkstationStore(() => now, () => "secret");
  const workstation = store.pair(store.issuePairing("hotel-a", "operator-a").code, 1)!;
  now = 2_000;
  assert.equal(store.ingestRecognition(workstation.token, {
    providerEventId: "event-1", deviceId: "senseface-1", deviceUserId: "900000001",
    occurredAt: "2026-08-01T10:00:00.000Z", sourceTable: "ATTLOG", verifyType: "255", eventCode: "1",
  }), null);
});

test("dedupe is isolated by hotel", () => {
  const secrets = ["pair-a", "token-a", "pair-b", "token-b"];
  const store = new WorkstationStore(() => 1_000, () => secrets.shift()!);
  const a = store.pair(store.issuePairing("hotel-a", "operator-a").code)!;
  const b = store.pair(store.issuePairing("hotel-b", "operator-b").code)!;
  const payload = {
    providerEventId: "event-1", deviceId: "senseface-1", deviceUserId: "900000001",
    occurredAt: "2026-08-01T10:00:00.000Z", sourceTable: "ATTLOG", verifyType: "255", eventCode: "1",
  };

  assert.deepEqual(store.ingestRecognition(a.token, payload), { accepted: true, duplicate: false });
  assert.deepEqual(store.ingestRecognition(b.token, payload), { accepted: true, duplicate: false });
});

test("recognitions expire and public listing omits device user id", () => {
  let now = 1_000;
  const store = new WorkstationStore(() => now, () => "secret");
  const workstation = store.pair(store.issuePairing("hotel-a", "operator-a").code)!;
  store.ingestRecognition(workstation.token, {
    providerEventId: "event-1", deviceId: "senseface-1", deviceUserId: "900000001",
    occurredAt: "2026-08-01T10:00:00.000Z", sourceTable: "ATTLOG", verifyType: "255", eventCode: "1",
  });

  assert.equal("deviceUserId" in store.listRecognitions("hotel-a")[0]!, false);
  now += 24 * 60 * 60 * 1_000 + 1;
  assert.equal(store.listRecognitions("hotel-a").length, 0);
});

test("recognition storage is bounded", () => {
  const secrets = ["pair-a", "token-a"];
  const store = new WorkstationStore(() => 1_000, () => secrets.shift()!);
  const workstation = store.pair(store.issuePairing("hotel-a", "operator-a").code)!;
  for (let index = 0; index <= 1_000; index++) {
    store.ingestRecognition(workstation.token, {
      providerEventId: `event-${index}`, deviceId: "senseface-1", deviceUserId: `${index}`,
      occurredAt: "2026-08-01T10:00:00.000Z", sourceTable: "ATTLOG", verifyType: "255", eventCode: "1",
    });
  }

  assert.equal(store.listRecognitions("hotel-a", 2_000).length, 1_000);
});

test("recognition body length is required and capped", () => {
  assert.equal(acceptsRecognitionBodyLength(null), false);
  assert.equal(acceptsRecognitionBodyLength("0"), false);
  assert.equal(acceptsRecognitionBodyLength("1024"), true);
  assert.equal(acceptsRecognitionBodyLength("65537"), false);
});

test("process-local recognition relay is unavailable in production", () => {
  assert.equal(recognitionRelayAvailable("production"), false);
  assert.equal(recognitionRelayAvailable("development"), true);
  assert.equal(recognitionRelayAvailable("test"), true);
});
