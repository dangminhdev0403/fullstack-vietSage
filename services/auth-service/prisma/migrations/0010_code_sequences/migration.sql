-- CreateTable
CREATE TABLE "Code" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sequenceNext" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Code_name_key" ON "Code"("name");

-- CreateIndex
CREATE INDEX "Code_name_idx" ON "Code"("name");

-- CreateIndex
CREATE INDEX "Code_isActive_idx" ON "Code"("isActive");
