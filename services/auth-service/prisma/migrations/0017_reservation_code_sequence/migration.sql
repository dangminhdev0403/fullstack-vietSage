INSERT INTO "Code" ("id", "name", "sequenceNext", "isActive", "createdAt", "updatedAt")
VALUES ('code_reservation', 'RESERVATION', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
