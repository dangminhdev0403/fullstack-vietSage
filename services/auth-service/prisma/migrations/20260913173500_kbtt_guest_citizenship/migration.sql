-- CreateEnum
CREATE TYPE "CitizenshipKind" AS ENUM ('VIETNAMESE', 'FOREIGN');

-- AlterTable
ALTER TABLE "GuestStayOccupant" ADD COLUMN "citizenshipKind" "CitizenshipKind";
