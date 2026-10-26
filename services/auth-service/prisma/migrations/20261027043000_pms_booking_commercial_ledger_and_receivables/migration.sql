-- CreateEnum
CREATE TYPE "BookingSourceCategory" AS ENUM ('DIRECT', 'OTA', 'TRAVEL_AGENCY', 'CORPORATE', 'OTHER');
CREATE TYPE "ReservationChargeLineType" AS ENUM ('ROOM_NIGHT', 'EXTRA');
CREATE TYPE "BookingPaymentIntent" AS ENUM ('DEPOSIT', 'ADVANCE', 'FULL');
CREATE TYPE "BookingPaymentMode" AS ENUM ('PERCENT', 'AMOUNT', 'FULL');
CREATE TYPE "BookingPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'ALLOCATED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "ReceivableDebtorType" AS ENUM ('GUEST', 'PARTNER', 'COMPANY');
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_COLLECTED', 'SETTLED', 'WRITTEN_OFF');

-- AlterTable Reservation
ALTER TABLE "Reservation" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "sourceCategory" "BookingSourceCategory";
ALTER TABLE "Reservation" ADD COLUMN "sourcePartnerId" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "bookingOwnerUserId" TEXT;

-- CreateTable ReservationGroup
CREATE TABLE "ReservationGroup" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "groupCode" VARCHAR(80) NOT NULL,
    "groupName" VARCHAR(120),
    "leadGuestName" VARCHAR(120) NOT NULL,
    "leadGuestPhone" VARCHAR(40),
    "sourceCategory" "BookingSourceCategory",
    "sourcePartnerId" TEXT,
    "bookingOwnerUserId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable BookingSourcePartner
CREATE TABLE "BookingSourcePartner" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "category" "BookingSourceCategory" NOT NULL DEFAULT 'DIRECT',
    "contactPerson" VARCHAR(120),
    "contactPhone" VARCHAR(40),
    "contactEmail" VARCHAR(160),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSourcePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReservationChargeLine
CREATE TABLE "ReservationChargeLine" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "lineType" "ReservationChargeLineType" NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "serviceItemId" TEXT,
    "nameSnapshot" VARCHAR(160) NOT NULL,
    "codeSnapshot" VARCHAR(80),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "taxAmountSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmountSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSnapshot" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "isPostedToFolio" BOOLEAN NOT NULL DEFAULT false,
    "postedFolioItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationChargeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable BookingPayment
CREATE TABLE "BookingPayment" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "reservationId" TEXT,
    "groupId" TEXT,
    "intent" "BookingPaymentIntent" NOT NULL DEFAULT 'DEPOSIT',
    "inputMode" "BookingPaymentMode" NOT NULL DEFAULT 'AMOUNT',
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "receivedAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "status" "BookingPaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "transactionReference" VARCHAR(120),
    "notes" TEXT,
    "idempotencyKey" VARCHAR(120),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable BookingPaymentAllocation
CREATE TABLE "BookingPaymentAllocation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "bookingPaymentId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "allocatedAmount" DECIMAL(12,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable HotelReceivable
CREATE TABLE "HotelReceivable" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "debtorName" VARCHAR(120) NOT NULL,
    "debtorType" "ReceivableDebtorType" NOT NULL DEFAULT 'GUEST',
    "debtorPartnerId" TEXT,
    "assigneeUserId" TEXT,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "outstandingAmount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReceivableCollection
CREATE TABLE "ReceivableCollection" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "collectedAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedByUserId" TEXT,
    "reference" VARCHAR(120),
    "notes" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable HotelConfirmationTemplate
CREATE TABLE "HotelConfirmationTemplate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL DEFAULT 'PHIẾU XÁC NHẬN ĐẶT PHÒNG',
    "subtitle" VARCHAR(255),
    "contactInfo" VARCHAR(500),
    "checkInPolicy" VARCHAR(1000),
    "checkOutPolicy" VARCHAR(1000),
    "paymentTerms" VARCHAR(1000),
    "footerNotes" VARCHAR(1000),
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showPriceBreakdown" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelConfirmationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationGroup_hotelId_groupCode_key" ON "ReservationGroup"("hotelId", "groupCode");
CREATE INDEX "ReservationGroup_hotelId_createdAt_idx" ON "ReservationGroup"("hotelId", "createdAt");

CREATE UNIQUE INDEX "BookingSourcePartner_hotelId_code_key" ON "BookingSourcePartner"("hotelId", "code");
CREATE INDEX "BookingSourcePartner_hotelId_isActive_idx" ON "BookingSourcePartner"("hotelId", "isActive");

CREATE INDEX "ReservationChargeLine_hotelId_reservationId_idx" ON "ReservationChargeLine"("hotelId", "reservationId");
CREATE INDEX "ReservationChargeLine_reservationId_serviceDate_idx" ON "ReservationChargeLine"("reservationId", "serviceDate");

CREATE UNIQUE INDEX "BookingPayment_idempotencyKey_key" ON "BookingPayment"("idempotencyKey");
CREATE INDEX "BookingPayment_hotelId_reservationId_idx" ON "BookingPayment"("hotelId", "reservationId");
CREATE INDEX "BookingPayment_hotelId_groupId_idx" ON "BookingPayment"("hotelId", "groupId");
CREATE INDEX "BookingPayment_hotelId_status_receivedAt_idx" ON "BookingPayment"("hotelId", "status", "receivedAt");

CREATE INDEX "BookingPaymentAllocation_hotelId_bookingPaymentId_idx" ON "BookingPaymentAllocation"("hotelId", "bookingPaymentId");
CREATE INDEX "BookingPaymentAllocation_hotelId_folioId_idx" ON "BookingPaymentAllocation"("hotelId", "folioId");

CREATE INDEX "HotelReceivable_hotelId_status_dueDate_idx" ON "HotelReceivable"("hotelId", "status", "dueDate");
CREATE INDEX "HotelReceivable_hotelId_stayId_idx" ON "HotelReceivable"("hotelId", "stayId");

CREATE INDEX "ReceivableCollection_hotelId_receivableId_idx" ON "ReceivableCollection"("hotelId", "receivableId");
CREATE INDEX "ReceivableCollection_hotelId_collectedAt_idx" ON "ReceivableCollection"("hotelId", "collectedAt");

CREATE UNIQUE INDEX "HotelConfirmationTemplate_hotelId_key" ON "HotelConfirmationTemplate"("hotelId");

CREATE INDEX "Reservation_hotelId_groupId_idx" ON "Reservation"("hotelId", "groupId");
CREATE INDEX "Reservation_hotelId_sourcePartnerId_idx" ON "Reservation"("hotelId", "sourcePartnerId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ReservationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_sourcePartnerId_fkey" FOREIGN KEY ("sourcePartnerId") REFERENCES "BookingSourcePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReservationGroup" ADD CONSTRAINT "ReservationGroup_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservationGroup" ADD CONSTRAINT "ReservationGroup_sourcePartnerId_fkey" FOREIGN KEY ("sourcePartnerId") REFERENCES "BookingSourcePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingSourcePartner" ADD CONSTRAINT "BookingSourcePartner_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReservationChargeLine" ADD CONSTRAINT "ReservationChargeLine_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservationChargeLine" ADD CONSTRAINT "ReservationChargeLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ReservationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingPaymentAllocation" ADD CONSTRAINT "BookingPaymentAllocation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingPaymentAllocation" ADD CONSTRAINT "BookingPaymentAllocation_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "BookingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingPaymentAllocation" ADD CONSTRAINT "BookingPaymentAllocation_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingPaymentAllocation" ADD CONSTRAINT "BookingPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HotelReceivable" ADD CONSTRAINT "HotelReceivable_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelReceivable" ADD CONSTRAINT "HotelReceivable_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelReceivable" ADD CONSTRAINT "HotelReceivable_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelReceivable" ADD CONSTRAINT "HotelReceivable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotelReceivable" ADD CONSTRAINT "HotelReceivable_debtorPartnerId_fkey" FOREIGN KEY ("debtorPartnerId") REFERENCES "BookingSourcePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReceivableCollection" ADD CONSTRAINT "ReceivableCollection_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivableCollection" ADD CONSTRAINT "ReceivableCollection_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "HotelReceivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HotelConfirmationTemplate" ADD CONSTRAINT "HotelConfirmationTemplate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
