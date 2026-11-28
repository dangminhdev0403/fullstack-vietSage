ALTER TABLE "ReceivableCollection"
  ADD COLUMN "submissionKey" VARCHAR(120),
  ADD COLUMN "legIndex" INTEGER,
  ADD COLUMN "requestHash" VARCHAR(64);

CREATE UNIQUE INDEX "ReceivableCollection_receivableId_submissionKey_legIndex_key"
  ON "ReceivableCollection" ("receivableId", "submissionKey", "legIndex");

ALTER TABLE "HotelExpensePayment" ADD COLUMN "requestHash" VARCHAR(64);

CREATE UNIQUE INDEX "HotelExpensePayment_expenseId_idempotencyKey_key"
  ON "HotelExpensePayment" ("expenseId", "idempotencyKey");
