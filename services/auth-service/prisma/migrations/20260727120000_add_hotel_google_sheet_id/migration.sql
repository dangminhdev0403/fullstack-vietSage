ALTER TABLE "Hotel"
ADD COLUMN "googleSheetId" VARCHAR(200);

CREATE UNIQUE INDEX "Hotel_googleSheetId_key"
ON "Hotel"("googleSheetId");
