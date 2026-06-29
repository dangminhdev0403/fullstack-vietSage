-- CreateEnum
CREATE TYPE "CategoryPriceUpdateMode" AS ENUM ('CATEGORY_ONLY', 'OVERRIDE_ALL_ITEMS');

-- CreateEnum
CREATE TYPE "FolioStatus" AS ENUM ('OPEN', 'CHECKOUT_PENDING', 'CLOSED', 'VOID');

-- CreateEnum
CREATE TYPE "FolioItemType" AS ENUM ('SERVICE', 'ROOM_CHARGE', 'MANUAL_CHARGE', 'DISCOUNT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FolioItemSourceType" AS ENUM ('GUEST_REQUEST', 'ROOM', 'STAY', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "GuestRequestBillingPostStatus" AS ENUM ('NONE', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'MOMO', 'VNPAY', 'STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'MOMO', 'VNPAY', 'STRIPE', 'BANK_TRANSFER');

-- AlterEnum
ALTER TYPE "GuestStayStatus" ADD VALUE 'CHECKOUT_PENDING';

-- AlterTable
ALTER TABLE "EmergencyCallEvent" ADD COLUMN     "hotelServiceItemId" TEXT;

-- AlterTable
ALTER TABLE "GuestRequest" ADD COLUMN     "billingFolioItemId" TEXT,
ADD COLUMN     "billingPostFailureReason" VARCHAR(1000),
ADD COLUMN     "billingPostStatus" "GuestRequestBillingPostStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "billingPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Folio" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "folioNumber" VARCHAR(80) NOT NULL,
    "status" "FolioStatus" NOT NULL DEFAULT 'OPEN',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutStartedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "closedByUserId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioItem" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "itemType" "FolioItemType" NOT NULL,
    "sourceType" "FolioItemSourceType" NOT NULL,
    "sourceId" VARCHAR(120),
    "roomId" TEXT,
    "serviceItemId" TEXT,
    "guestRequestId" TEXT,
    "codeSnapshot" VARCHAR(80),
    "nameSnapshot" VARCHAR(160) NOT NULL,
    "descriptionSnapshot" VARCHAR(1000),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxRateSnapshot" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "taxAmountSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmountSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotalSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "metadataSnapshotJson" JSONB,
    "billingSourceSnapshot" JSONB NOT NULL,
    "serviceCompletedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedByUserId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "invoiceNumber" VARCHAR(80) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoiceSnapshotJson" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "issuedByUserId" TEXT,
    "paidByUserId" TEXT,
    "voidedByUserId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "paymentNumber" VARCHAR(80) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
    "method" "PaymentMethod" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "providerSessionId" VARCHAR(255),
    "providerPaymentId" VARCHAR(255),
    "paymentUrl" VARCHAR(1000),
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" VARCHAR(1000),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" VARCHAR(255),
    "providerTransactionId" VARCHAR(255),
    "eventType" VARCHAR(120) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "rawPayloadJson" JSONB,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Folio_hotelId_idx" ON "Folio"("hotelId");

-- CreateIndex
CREATE INDEX "Folio_stayId_idx" ON "Folio"("stayId");

-- CreateIndex
CREATE INDEX "Folio_roomId_idx" ON "Folio"("roomId");

-- CreateIndex
CREATE INDEX "Folio_status_idx" ON "Folio"("status");

-- CreateIndex
CREATE INDEX "Folio_createdAt_idx" ON "Folio"("createdAt");

-- CreateIndex
CREATE INDEX "Folio_hotelId_status_idx" ON "Folio"("hotelId", "status");

-- CreateIndex
CREATE INDEX "Folio_hotelId_stayId_idx" ON "Folio"("hotelId", "stayId");

-- CreateIndex
CREATE UNIQUE INDEX "Folio_hotelId_folioNumber_key" ON "Folio"("hotelId", "folioNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FolioItem_guestRequestId_key" ON "FolioItem"("guestRequestId");

-- CreateIndex
CREATE INDEX "FolioItem_hotelId_idx" ON "FolioItem"("hotelId");

-- CreateIndex
CREATE INDEX "FolioItem_folioId_idx" ON "FolioItem"("folioId");

-- CreateIndex
CREATE INDEX "FolioItem_stayId_idx" ON "FolioItem"("stayId");

-- CreateIndex
CREATE INDEX "FolioItem_itemType_idx" ON "FolioItem"("itemType");

-- CreateIndex
CREATE INDEX "FolioItem_sourceType_sourceId_idx" ON "FolioItem"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "FolioItem_serviceItemId_idx" ON "FolioItem"("serviceItemId");

-- CreateIndex
CREATE INDEX "FolioItem_postedAt_idx" ON "FolioItem"("postedAt");

-- CreateIndex
CREATE INDEX "FolioItem_hotelId_folioId_idx" ON "FolioItem"("hotelId", "folioId");

-- CreateIndex
CREATE INDEX "FolioItem_hotelId_sourceType_sourceId_idx" ON "FolioItem"("hotelId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Invoice_hotelId_idx" ON "Invoice"("hotelId");

-- CreateIndex
CREATE INDEX "Invoice_folioId_idx" ON "Invoice"("folioId");

-- CreateIndex
CREATE INDEX "Invoice_stayId_idx" ON "Invoice"("stayId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_hotelId_status_idx" ON "Invoice"("hotelId", "status");

-- CreateIndex
CREATE INDEX "Invoice_hotelId_issuedAt_idx" ON "Invoice"("hotelId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_hotelId_invoiceNumber_key" ON "Invoice"("hotelId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_hotelId_idx" ON "Payment"("hotelId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_folioId_idx" ON "Payment"("folioId");

-- CreateIndex
CREATE INDEX "Payment_stayId_idx" ON "Payment"("stayId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- CreateIndex
CREATE INDEX "Payment_providerSessionId_idx" ON "Payment"("providerSessionId");

-- CreateIndex
CREATE INDEX "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_hotelId_paymentNumber_key" ON "Payment"("hotelId", "paymentNumber");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentId_idx" ON "PaymentTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_invoiceId_idx" ON "PaymentTransaction"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_idx" ON "PaymentTransaction"("provider");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerEventId_idx" ON "PaymentTransaction"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerTransactionId_idx" ON "PaymentTransaction"("providerTransactionId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_processedAt_idx" ON "PaymentTransaction"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_hotelId_provider_providerEventId_key" ON "PaymentTransaction"("hotelId", "provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestRequest_billingFolioItemId_key" ON "GuestRequest"("billingFolioItemId");

-- CreateIndex
CREATE INDEX "GuestRequest_billingPostStatus_idx" ON "GuestRequest"("billingPostStatus");

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_billingFolioItemId_fkey" FOREIGN KEY ("billingFolioItemId") REFERENCES "FolioItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "HotelServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_guestRequestId_fkey" FOREIGN KEY ("guestRequestId") REFERENCES "GuestRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_hotelServiceItemId_fkey" FOREIGN KEY ("hotelServiceItemId") REFERENCES "HotelServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
