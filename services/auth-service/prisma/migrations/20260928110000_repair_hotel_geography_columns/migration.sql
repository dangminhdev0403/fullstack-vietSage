-- Repair schema drift: these nullable Hotel fields exist in Prisma but were never migrated.
ALTER TABLE "Hotel"
    ADD COLUMN IF NOT EXISTS "provinceCode" VARCHAR(40),
    ADD COLUMN IF NOT EXISTS "province" VARCHAR(80),
    ADD COLUMN IF NOT EXISTS "area" VARCHAR(120);
