import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { settleCheckout, checkoutErrorMessage } from "./checkout-settlement.ts";

function fixture() {
  const calls: string[] = [];
  return {
    calls,
    input: {
      folioId: "folio", amount: 500000, autoMarkReady: true,
      issueInvoice: async () => { calls.push("invoice"); return { id: "invoice", balanceAmount: 500000 }; },
      confirmPayment: async (_id: string, _amount?: number) => { calls.push("payment"); return { invoice: { status: "PAID", balanceAmount: 0 } }; },
      checkOutStay: async () => { calls.push("checkout"); },
      markRoomReady: async () => { calls.push("ready"); },
    },
  };
}

test("failed direct checkout rejects and never attempts readiness", async () => {
  const f = fixture();
  await assert.rejects(settleCheckout({ ...f.input, folioId: undefined,
    checkOutStay: async () => { throw new Error("conflict"); },
  }), /conflict/);
  assert.deepEqual(f.calls, []);
});

test("invoice or payment failure never completes checkout", async () => {
  for (const operation of ["issueInvoice", "confirmPayment"] as const) {
    const f = fixture();
    await assert.rejects(settleCheckout({ ...f.input, [operation]: async () => { throw new Error("unavailable"); } }), /unavailable/);
    assert.ok(!f.calls.includes("ready"));
  }
});

test("changed authoritative balance is rejected before collecting money", async () => {
  const f = fixture();
  await assert.rejects(settleCheckout({ ...f.input, amount: 1 }), /CHECKOUT_BALANCE_CHANGED/);
  assert.deepEqual(f.calls, ["invoice"]);
});

test("a partial invoice cannot be reported as settled", async () => {
  const f = fixture();
  await assert.rejects(settleCheckout({ ...f.input,
    confirmPayment: async () => ({ invoice: { status: "ISSUED", balanceAmount: 100 } }),
  }), /CHECKOUT_NOT_SETTLED/);
  assert.ok(!f.calls.includes("ready"));
});

test("zero balance still requires confirmed invoice closure", async () => {
  const f = fixture();
  await settleCheckout({ ...f.input, amount: 0,
    issueInvoice: async () => ({ id: "invoice", balanceAmount: 0 }),
    confirmPayment: async (_id, amount) => {
      assert.equal(amount, undefined);
      return { invoice: { status: "PAID", balanceAmount: 0 } };
    },
  });
  assert.deepEqual(f.calls, ["ready"]);
});

test("readiness failure is reported separately after confirmed payment", async () => {
  const f = fixture();
  const result = await settleCheckout({ ...f.input, markRoomReady: async () => { throw new Error("conflict"); } });
  assert.equal(result.roomReady, false);
  assert.deepEqual(f.calls, ["invoice", "payment"]);
});

test("success requires invoice, payment, then readiness in order", async () => {
  const f = fixture();
  assert.equal((await settleCheckout(f.input)).roomReady, true);
  assert.deepEqual(f.calls, ["invoice", "payment", "ready"]);
  assert.ok(!checkoutErrorMessage(new Error("Prisma internal secret" )).includes("Prisma"));
});
