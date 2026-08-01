import assert from "node:assert/strict";
import test from "node:test";

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
