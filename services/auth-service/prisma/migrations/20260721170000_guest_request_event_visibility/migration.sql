ALTER TABLE "GuestRequestEvent"
ADD COLUMN "visibility" VARCHAR(16) NOT NULL DEFAULT 'GUEST';

CREATE INDEX "GuestRequestEvent_requestId_visibility_createdAt_idx"
ON "GuestRequestEvent"("requestId", "visibility", "createdAt");
