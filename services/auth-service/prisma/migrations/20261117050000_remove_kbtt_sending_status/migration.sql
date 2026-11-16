-- Stop old application writers before deploying this enum contraction.
-- An interrupted request may have reached BCA: preserve its payload and fence retries.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "KbttGuestDeclaration", "KbttStayOperation" IN ACCESS EXCLUSIVE MODE;
UPDATE "KbttGuestDeclaration"
SET "status" = 'UNKNOWN', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP,
    "providerCode" = COALESCE("providerCode", 'LEGACY_DELIVERY_UNRESOLVED'),
    "providerMessage" = COALESCE("providerMessage", 'Lần gửi cũ chưa rõ kết quả; cần đối soát BCA trước khi gửi lại.')
WHERE "status"::text = 'SENDING';
UPDATE "KbttStayOperation"
SET "status" = 'UNKNOWN', "claimToken" = NULL, "updatedAt" = CURRENT_TIMESTAMP,
    "providerCode" = COALESCE("providerCode", 'LEGACY_DELIVERY_UNRESOLVED'),
    "providerMessage" = COALESCE("providerMessage", 'Lần gửi cũ chưa rõ kết quả; cần đối soát BCA trước khi gửi lại.')
WHERE "status"::text = 'SENDING';
ALTER TABLE "KbttGuestDeclaration" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "KbttDeclarationStatus" RENAME TO "KbttDeclarationStatus_old";
CREATE TYPE "KbttDeclarationStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'FAILED', 'UNKNOWN', 'CANCELLED');
ALTER TABLE "KbttGuestDeclaration" ALTER COLUMN "status" TYPE "KbttDeclarationStatus" USING "status"::text::"KbttDeclarationStatus";
DROP TYPE "KbttDeclarationStatus_old";
ALTER TABLE "KbttGuestDeclaration" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "KbttStayOperation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "KbttStayOperationStatus" RENAME TO "KbttStayOperationStatus_old";
CREATE TYPE "KbttStayOperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', 'BLOCKED', 'SUPERSEDED');
ALTER TABLE "KbttStayOperation" ALTER COLUMN "status" TYPE "KbttStayOperationStatus" USING "status"::text::"KbttStayOperationStatus";
DROP TYPE "KbttStayOperationStatus_old";
ALTER TABLE "KbttStayOperation" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
