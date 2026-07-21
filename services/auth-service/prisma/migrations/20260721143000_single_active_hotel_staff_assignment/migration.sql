WITH ranked_assignments AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "assignedAt" DESC, "updatedAt" DESC, "id" DESC
    ) AS assignment_rank
  FROM "HotelStaffAssignment"
  WHERE "status" = 'ACTIVE'
)
UPDATE "HotelStaffAssignment" AS assignment
SET
  "status" = 'REVOKED',
  "revokedAt" = COALESCE(assignment."revokedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_assignments
WHERE assignment."id" = ranked_assignments."id"
  AND ranked_assignments.assignment_rank > 1;

CREATE UNIQUE INDEX "HotelStaffAssignment_one_active_per_user_key"
ON "HotelStaffAssignment"("userId")
WHERE "status" = 'ACTIVE';

-- Rollback (manual, local/preview only):
-- DROP INDEX "HotelStaffAssignment_one_active_per_user_key";
