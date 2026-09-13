-- CreateEnum
CREATE TYPE "KbttCatalogKind" AS ENUM ('NATIONALITY', 'PROVINCE', 'WARD', 'STAY_REASON', 'DOCUMENT_TYPE', 'RESIDENCE_PLACE');

-- CreateTable
CREATE TABLE "KbttCatalogItem" (
    "id" TEXT NOT NULL,
    "kind" "KbttCatalogKind" NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "parentCodeNormalized" VARCHAR(64) NOT NULL DEFAULT '',
    "nameVi" VARCHAR(255) NOT NULL,
    "nameEn" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbttCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KbttCatalogItem_kind_code_parentCodeNormalized_key" ON "KbttCatalogItem"("kind", "code", "parentCodeNormalized");

-- CreateIndex
CREATE INDEX "KbttCatalogItem_kind_isActive_idx" ON "KbttCatalogItem"("kind", "isActive");

-- CreateIndex
CREATE INDEX "KbttCatalogItem_kind_parentCodeNormalized_isActive_idx" ON "KbttCatalogItem"("kind", "parentCodeNormalized", "isActive");
