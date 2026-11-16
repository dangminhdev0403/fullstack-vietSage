-- Lossless draft-only compaction. Deploy the matching application with writers stopped.
-- No shared profile, submitted snapshot, provider result or frozen revision is rewritten.
BEGIN;
LOCK TABLE "GuestStay", "GuestStayOccupant", "Room", "KbttGuestDeclaration"
  IN SHARE ROW EXCLUSIVE MODE;

-- COMPACT_CTE
WITH candidates AS (
  SELECT d.id, d.version, d."declarationKind"::text AS kind,
    d."draftPayloadJson" AS original_payload,
    o."fullName", o.gender, o."identityNumber", o."dateOfBirth",
    r."roomNumber", s."checkedInAt", s."plannedCheckInAt", s."plannedCheckOutAt"
  FROM "KbttGuestDeclaration" d
  JOIN "GuestStayOccupant" o ON o.id = d."occupantId"
    AND o."hotelId" = d."hotelId" AND o."stayId" = d."stayId"
  JOIN "GuestStay" s ON s.id = d."stayId" AND s."hotelId" = d."hotelId"
  JOIN "Room" r ON r.id = s."roomId" AND r."hotelId" = d."hotelId"
  WHERE d.status::text IN ('DRAFT', 'READY', 'FAILED')
    AND jsonb_typeof(d."draftPayloadJson") = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM "KbttGuestDeclaration" newer
      WHERE newer."hotelId" = d."hotelId" AND newer."occupantId" = d."occupantId"
        AND (newer.revision, newer."createdAt", newer.id) > (d.revision, d."createdAt", d.id)
    )
), canonical AS (
  SELECT candidates.*, jsonb_strip_nulls(jsonb_build_object(
    'hoTen', NULLIF("fullName", ''),
    'gioiTinh', CASE
      WHEN upper(btrim(gender)) IN ('M', 'MALE', 'NAM', 'MALE [M]') THEN 'M'
      WHEN upper(btrim(gender)) IN ('F', 'FEMALE', 'NỮ', 'NU', 'FEMALE [F]') THEN 'F' END,
    'soGiayTo', CASE WHEN kind = 'VIETNAMESE'
      AND btrim("identityNumber") ~ '^[A-Za-z0-9]{1,32}$' THEN btrim("identityNumber") END,
    'soHoChieu', CASE WHEN kind = 'FOREIGN'
      AND btrim("identityNumber") ~ '^[A-Za-z0-9]{1,32}$' THEN btrim("identityNumber") END,
    'ngayThangNamSinhStr', CASE
      WHEN btrim("dateOfBirth") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        CASE WHEN substring(btrim("dateOfBirth"), 1, 4)::int BETWEEN 1000 AND 9999
          AND substring(btrim("dateOfBirth"), 6, 2)::int BETWEEN 1 AND 12 THEN
          CASE WHEN substring(btrim("dateOfBirth"), 9, 2)::int BETWEEN 1 AND
            extract(day FROM (make_date(substring(btrim("dateOfBirth"), 1, 4)::int,
              substring(btrim("dateOfBirth"), 6, 2)::int, 1) + interval '1 month - 1 day'))::int
          THEN btrim("dateOfBirth") END END
      WHEN kind = 'FOREIGN' AND btrim("dateOfBirth") ~ '^[0-9]{4}$'
        AND (NOT (original_payload ? 'loaiNgayThangNamSinh')
          OR original_payload->'loaiNgayThangNamSinh' IN ('null'::jsonb, '""'::jsonb, '"Y"'::jsonb))
        THEN CASE WHEN btrim("dateOfBirth")::int BETWEEN 1000 AND 9999
          THEN btrim("dateOfBirth") || '-01-01' END END,
    'soPhong', NULLIF("roomNumber", ''),
    'ngayDenCsltStr', to_char((coalesce("checkedInAt", "plannedCheckInAt") AT TIME ZONE 'UTC')
      AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS'),
    'ngayDiDuKienStr', to_char(("plannedCheckOutAt" AT TIME ZONE 'UTC')
      AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')
  )) AS defaults
  FROM candidates
), compacted AS (
  SELECT id, version, original_payload,
    (SELECT coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
     FROM jsonb_each(original_payload) entry
     WHERE NOT (defaults ? entry.key AND entry.value = defaults->entry.key)) AS new_payload
  FROM canonical
)
-- APPLY_COMPACTION
UPDATE "KbttGuestDeclaration" d
SET "draftPayloadJson" = compacted.new_payload, version = d.version + 1
FROM compacted
WHERE d.id = compacted.id AND d.version = compacted.version
  AND d."draftPayloadJson" IS DISTINCT FROM compacted.new_payload;
COMMIT;
