/**
 * Deterministic idempotency key generator for financial write operations (Receivables & Expenses).
 * Conforms to R2/R6 requirements:
 * - Stable per-operation idempotencyKey tied directly to actual payload and dates
 * - Survives retry attempts with identical key
 * - Varies when payload (amount, date, method, account, splits) changes
 * - Length strictly within 120 characters (Zod schema constraint)
 */

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeAccount(acc?: string | null): string {
  if (!acc) return "none";
  const trimmed = acc.trim().toLowerCase();
  return trimmed || "none";
}

export type ReceivableIdempotencyParams = {
  receivableId: string;
  amount: number;
  collectedAtDate: string; // YYYY-MM-DD
  method: string;
  destinationAccount?: string | null;
  receivingAccount?: string | null;
  splits?: Array<{
    method: string;
    amount: number;
    receivingAccount?: string | null;
    destinationAccount?: string | null;
  }> | null;
  salt?: string;
};

export function generateReceivableCollectionIdempotencyKey(
  params: ReceivableIdempotencyParams,
): string {
  const recId = (params.receivableId || "").trim();
  const recSnippet = recId.length > 12 ? recId.slice(-12) : recId || "rec";
  const date = (params.collectedAtDate || "").trim().slice(0, 10) || "undated";
  const roundedAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
  const method = (params.method || "MANUAL").trim().toUpperCase();
  const primaryAccount = normalizeAccount(params.destinationAccount ?? params.receivingAccount);

  let splitsRepresentation = "";
  if (params.splits && params.splits.length > 0) {
    splitsRepresentation = params.splits
      .map(
        (s) =>
          `${s.method}:${Math.round(s.amount * 100) / 100}:${normalizeAccount(s.receivingAccount ?? s.destinationAccount)}`,
      )
      .sort()
      .join("|");
  }

  const payloadString = [
    recId,
    date,
    roundedAmount,
    method,
    primaryAccount,
    splitsRepresentation,
    params.salt || "",
  ].join("::");

  const fingerprint = fnv1a32(payloadString);
  const methodTag = method.slice(0, 4);

  // Format: rc-{snippet}-{date}-{amountInt}-{methodTag}-{fingerprint}
  const key = `rc-${recSnippet}-${date}-${Math.round(roundedAmount)}-${methodTag}-${fingerprint}`;
  return key.slice(0, 120);
}

export type ExpenseIdempotencyParams = {
  hotelId: string;
  expenseDate: string; // YYYY-MM-DD
  category: string;
  title: string;
  amount: number;
  paidAmount?: number;
  paymentStatus: string;
  paymentMethod?: string | null;
  paymentAccount?: string | null;
  salt?: string;
};

export function generateExpenseIdempotencyKey(
  params: ExpenseIdempotencyParams,
): string {
  const hotelId = (params.hotelId || "").trim();
  const hotelSnippet = hotelId.length > 10 ? hotelId.slice(-10) : hotelId || "hotel";
  const date = (params.expenseDate || "").trim().slice(0, 10) || "undated";
  const roundedAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
  const category = (params.category || "OTHER").trim().toUpperCase();
  const title = (params.title || "").trim().toLowerCase();
  const account = normalizeAccount(params.paymentAccount);
  const method = (params.paymentMethod || "NONE").trim().toUpperCase();
  const status = (params.paymentStatus || "UNPAID").trim().toUpperCase();

  const payloadString = [
    hotelId,
    date,
    category,
    title,
    roundedAmount,
    status,
    method,
    account,
    params.salt || "",
  ].join("::");

  const fingerprint = fnv1a32(payloadString);
  const catTag = category.slice(0, 4);

  // Format: exp-{snippet}-{date}-{amountInt}-{catTag}-{fingerprint}
  const key = `exp-${hotelSnippet}-${date}-${Math.round(roundedAmount)}-${catTag}-${fingerprint}`;
  return key.slice(0, 120);
}
