import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node strip-types executes explicit TS paths.
import { MobileShiftStore, SHIFT_MS, PAIR_MS, SCAN_MS } from "./mobile-shift-store.ts";

const owner = { hotelId: "hotel-a", operatorId: "staff-a", parentId: "parent-a", deskId: "desk-a" };
const labels = { hotelLabel: "Khách sạn thử", operatorLabel: "Lễ tân thử" };
const payload = { schemaVersion: 2 as const, transferId: crypto.randomUUID(), capturedAt: new Date().toISOString(), guest: { displayName: "KHACH THU", identityNumber: "000000000001" }, verification: { chipAuthenticated: false, sodVerified: false } };
function setup() {
  let clock = 1_000;
  const store = new MobileShiftStore(() => clock);
  const issued = store.create(owner, labels, "server-token");
  const claimed = store.claim(issued.code);
  store.approve(owner, issued.sessionId, claimed.view.comparisonCode!);
  return { store, issued, claimed, now: () => clock, advance: (ms: number) => { clock += ms; } };
}
test("pairing consumed by first phone; approval requires owner/tab/parent and comparison", () => {
  const store = new MobileShiftStore();
  const issued = store.create(owner, labels, "token");
  const phone = store.claim(issued.code);
  assert.equal(phone.view.phase, "pending");
  assert.throws(() => store.claim(issued.code));
  for (const changed of [{hotelId:"b"},{operatorId:"b"},{parentId:"b"},{deskId:"b"}]) {
    assert.throws(() => store.approve({...owner,...changed}, issued.sessionId, phone.view.comparisonCode!));
  }
  assert.throws(() => store.approve(owner, issued.sessionId, "000000x"));
  assert.throws(() => store.target(owner, issued.sessionId, "slot", "Phòng 101"));
  assert.equal(store.approve(owner, issued.sessionId, phone.view.comparisonCode!).phase, "active");
});
test("four-hour absolute boundary from approval; idle does not revoke or extend", () => {
  const f = setup();
  const expiry = f.store.phone(f.claimed.token).expiresAt;
  f.advance(SHIFT_MS - 1);
  assert.equal(f.store.phone(f.claimed.token).phase, "active");
  assert.equal(f.store.desk(owner, "fresh-token")!.expiresAt, expiry);
  f.advance(1);
  assert.throws(() => f.store.phone(f.claimed.token));
  assert.equal(f.store.desk(owner, "fresh-token"), null);
});
test("unapproved claim expires at two-minute boundary", () => {
  let time = 0;
  const store = new MobileShiftStore(() => time);
  const issued = store.create(owner, labels, "token");
  const phone = store.claim(issued.code);
  time = PAIR_MS;
  assert.throws(() => store.approve(owner, issued.sessionId, phone.view.comparisonCode!));
  assert.throws(() => store.phone(phone.token));
});
test("target replacement rejects old sends, preserves other tab, requires fresh desk presence", () => {
  const f = setup();
  const old = f.store.target(owner, f.issued.sessionId, "room1:0", "Phòng 101 - Khách 1").target!;
  const current = f.store.target(owner, f.issued.sessionId, "room2:0", "Phòng 102 - Khách 1").target!;
  assert.throws(() => f.store.submit(f.claimed.token, old.requestId, payload));
  assert.throws(() => f.store.ack({...owner,deskId:"other"},f.issued.sessionId,current.requestId,payload.transferId));
  f.advance(15_000);
  assert.throws(() => f.store.submit(f.claimed.token, current.requestId, payload));
  assert.equal(f.store.phone(f.claimed.token).deskOnline, false);
  f.store.desk(owner, "fresh-token");
  assert.equal(f.store.phone(f.claimed.token).target, null, "offline lease invalidates old destination");
});
test("submit retries and ACK are idempotent; phone views never contain PII", () => {
  const f = setup();
  const target = f.store.target(owner, f.issued.sessionId, "slot", "Phòng 101").target!;
  const sent = f.store.submit(f.claimed.token, target.requestId, payload);
  assert.equal(sent.target!.status, "received");
  assert.equal(JSON.stringify(sent).includes(payload.guest.identityNumber), false);
  assert.equal(f.store.submit(f.claimed.token, target.requestId, payload).target!.status, "received");
  assert.throws(() => f.store.submit(f.claimed.token, target.requestId, {...payload, transferId: crypto.randomUUID()}));
  assert.throws(() => f.store.submit(f.claimed.token, target.requestId, {...payload, guest:{...payload.guest,displayName:"OTHER"}}));
  assert.equal(f.store.desk(owner, "fresh-token")!.payload!.guest.displayName, "KHACH THU");
  const acked = f.store.ack(owner, f.issued.sessionId, target.requestId, payload.transferId);
  assert.equal(acked.payload, null);
  assert.equal(acked.target!.status, "acknowledged");
  assert.equal(f.store.ack(owner, f.issued.sessionId, target.requestId, payload.transferId).target!.status, "acknowledged");
  assert.equal(f.store.submit(f.claimed.token,target.requestId,payload).receipt!.status,"acknowledged");
  const next = f.store.target(owner, f.issued.sessionId, "next", "Phòng 101 - Khách 2");
  assert.equal(next.receipt!.status,"acknowledged");
  assert.throws(() => f.store.submit(f.claimed.token,next.target!.requestId,payload), "old transfer cannot fill next slot");
});
test("request TTL, conditional discard and revoke erase relay payload", () => {
  const f = setup();
  const old = f.store.target(owner,f.issued.sessionId,"old","Old").target!;
  const current = f.store.target(owner,f.issued.sessionId,"new","New").target!;
  f.store.discard(owner,f.issued.sessionId,old.requestId);
  assert.equal(f.store.phone(f.claimed.token).target!.requestId,current.requestId);
  f.store.submit(f.claimed.token,current.requestId,payload);
  f.advance(SCAN_MS);
  f.store.cleanup();
  assert.equal(f.store.desk(owner,"token")!.payload,null);
  f.store.revoke(owner,f.issued.sessionId);
  assert.throws(() => f.store.phone(f.claimed.token));
});
test("new pairing replaces same desk only; bounded store does not evict live sessions", () => {
  const store = new MobileShiftStore(Date.now, 2);
  const first = store.create(owner,labels,"token");
  const other = store.create({...owner,deskId:"other"},labels,"token");
  const fresh = store.create(owner,labels,"token");
  assert.throws(() => store.claim(first.code));
  assert.equal(store.claim(other.code).view.sessionId,other.sessionId);
  assert.equal(store.claim(fresh.code).view.sessionId,fresh.sessionId);
  assert.throws(() => store.create({...owner,deskId:"third"},labels,"token"));
});

// @ts-expect-error Node strip-types requires explicit extension.
import { sameOrigin, limitedJson, phoneCommand, mobileShiftAvailable } from "./mobile-shift-security.ts";
// @ts-expect-error Node strip-types requires explicit extension.
import { mayApplyMobile } from "../utils/mobile-scan-client.ts";
// @ts-expect-error Node strip-types requires explicit extension.
import { buildCccdPreviewModel } from "../utils/cccd-preview.ts";
test("CSRF, production guard, streamed body cap and strict phone schema", async () => {
  const request = (headers: Record<string,string>) => new Request("https://hotel.test/api/cccd-mobile/sessions", { method: "POST", headers, body: "{}" });
  assert.equal(sameOrigin(request({ origin: "https://hotel.test" })),true);
  assert.equal(sameOrigin(request({ origin: "https://evil.test" })),false);
  assert.equal(sameOrigin(request({})),false);
  assert.equal(sameOrigin(request({ origin:"https://hotel.test", "sec-fetch-site":"cross-site" })),false);
  assert.equal(sameOrigin(new Request("http://0.0.0.0:3000/api/cccd-mobile/sessions", {
    method: "POST",
    headers: { origin: "http://192.168.185.184:3000", host: "192.168.185.184:3000", "sec-fetch-site": "same-origin" },
    body: "{}"
  })), true);
  assert.equal(sameOrigin(new Request("http://0.0.0.0:3000/api/cccd-mobile/sessions", {
    method: "POST",
    headers: { origin: "http://evil.com", host: "192.168.185.184:3000", "sec-fetch-site": "same-origin" },
    body: "{}"
  })), false);
  assert.equal(mobileShiftAvailable("production"), true);
  assert.equal(mobileShiftAvailable("development"), true);
  assert.equal(mobileShiftAvailable("disabled"), false);
  assert.deepEqual(await limitedJson(request({"Content-Type":"application/json"})),{});
  await assert.rejects(limitedJson(request({"Content-Type":"application/json","Content-Length":"9000"})));
  const huge = new Request("https://hotel.test", {method:"POST",headers:{"Content-Type":"application/json"},body:'"'+'x'.repeat(9000)+'"'});
  await assert.rejects(limitedJson(huge));
  const valid = { action:"submit", requestId:crypto.randomUUID(),transferId:crypto.randomUUID(),raw:"synthetic" };
  assert.equal(phoneCommand.safeParse({...valid,verification:{chipAuthenticated:true}}).success,false);
  assert.equal(phoneCommand.safeParse({...valid,raw:"x".repeat(4097)}).success,false);
  assert.equal(phoneCommand.safeParse(valid).success,true);
});
test("client refuses wrong slot/expired/mismatched receipt and preview never overclaims QR", () => {
  const f=setup();
  const target=f.store.target(owner,f.issued.sessionId,"room1:0","Phòng 101").target!;
  f.store.submit(f.claimed.token,target.requestId,payload);
  const view=f.store.desk(owner,"token")!;
  assert.equal(mayApplyMobile(view,"room1:0",f.now()),true);
  assert.equal(mayApplyMobile(view,"room2:0",f.now()),false);
  assert.equal(mayApplyMobile(view,"room1:0",view.target!.expiresAt),false);
  assert.equal(mayApplyMobile({...view,payload:{...payload,transferId:crypto.randomUUID()}},"room1:0",f.now()),false);
  assert.equal(buildCccdPreviewModel(payload).chipVerified,false);
  assert.equal(buildCccdPreviewModel({...payload,verification:{chipAuthenticated:true,sodVerified:true}}).chipVerified,true);
});
