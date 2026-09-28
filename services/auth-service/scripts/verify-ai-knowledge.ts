import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function verifyAiKnowledge() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("=== KIỂM TRA ĐỒNG BỘ DỮ LIỆU TRI THỨC AI ===");

    // 1. Kiểm tra Tours
    const toursRes = await pool.query(`
      SELECT
        count(*) as total,
        count(latitude) as with_lat,
        count(longitude) as with_lng,
        count(CASE WHEN "provinceCode" = 'UNCLASSIFIED' THEN 1 END) as unclassified,
        count(CASE WHEN LENGTH("content") >= 200 THEN 1 END) as detailed_content
      FROM "LocalMateTourKnowledge"
    `);
    console.log("1. Thống kê Tours trong Kho Tri Thức:");
    console.table(toursRes.rows);

    // 2. Kiểm tra Guides
    const guidesRes = await pool.query(`
      SELECT
        "guideCode", "fullName", status, "languages", "operatingRegions", "dailyRateVnd",
        "serviceLatitude", "serviceLongitude", "rating", "totalReviews"
      FROM "LocalMateProfile"
      ORDER BY "guideCode" ASC
    `);
    console.log("\n2. Danh sách Hướng dẫn viên LocalMate (Qualified Guides):");
    console.table(guidesRes.rows);

    // 3. Kiểm tra Hotels
    const hotelsRes = await pool.query(`
      SELECT
        h."id", h."name", h."code", h."area", h."province", h."provinceCode", h."latitude", h."longitude",
        array_agg(e."featureKey") as enabled_features
      FROM "Hotel" h
      LEFT JOIN "hotel_feature_entitlements" e ON e."hotelId" = h."id" AND e."status" = 'ENABLED'
      GROUP BY h."id", h."name", h."code", h."area", h."province", h."provinceCode", h."latitude", h."longitude"
      ORDER BY h."code" ASC
    `);
    console.log("\n3. Thông tin Khách sạn & Tính năng AI được cấp phép:");
    console.table(hotelsRes.rows);

    // 4. Kiểm tra Đối tác lân cận (Local Partners)
    const partnersRes = await pool.query(`
      SELECT
        p."name", h."name" as "hotelName", c."nameVi" as "category", p."address",
        p."latitude", p."longitude", p."distanceMeters", p."phone",
        count(o."id") as "offersCount"
      FROM "LocalPartner" p
      JOIN "Hotel" h ON h."id" = p."hotelId"
      JOIN "LocalPartnerCategory" c ON c."id" = p."categoryId"
      LEFT JOIN "LocalPartnerOffer" o ON o."partnerId" = p."id"
      GROUP BY p."id", p."name", h."name", c."nameVi", p."address", p."latitude", p."longitude", p."distanceMeters", p."phone"
      ORDER BY h."name", p."distanceMeters" ASC
    `);
    console.log("\n4. Đối tác lân cận và Ưu đãi cho khách lưu trú:");
    console.table(partnersRes.rows);

    // 5. Kiểm tra Dịch vụ nội khu của HCA HomeStay
    const servicesRes = await pool.query(`
      SELECT
        c."name" as "category", i."name" as "serviceItem", i."priceOverride", i."quantityEnabled", i."status"
      FROM "HotelServiceItem" i
      JOIN "HotelServiceCategory" c ON c."id" = i."categoryId"
      JOIN "Hotel" h ON h."id" = i."hotelId"
      WHERE h."code" = 'HCA_HOMESTAY'
      ORDER BY c."sortOrder", i."priceOverride" ASC
    `);
    console.log("\n5. Dịch vụ phòng & Ẩm thực tại HCA HomeStay:");
    console.table(servicesRes.rows);

    // Assertions
    const totalTours = Number(toursRes.rows[0].total);
    const withLat = Number(toursRes.rows[0].with_lat);
    const unclassified = Number(toursRes.rows[0].unclassified);
    if (totalTours < 28 || withLat < totalTours || unclassified > 0) {
      throw new Error(`Kiểm tra dữ liệu tour không đạt: total=${totalTours}, withLat=${withLat}, unclassified=${unclassified}`);
    }

    const totalGuides = guidesRes.rows.length;
    const guidesWithCoords = guidesRes.rows.filter(g => g.serviceLatitude && g.serviceLongitude).length;
    if (totalGuides < 10 || guidesWithCoords < totalGuides) {
      throw new Error(`Kiểm tra dữ liệu HDV không đạt: totalGuides=${totalGuides}, withCoords=${guidesWithCoords}`);
    }

    // 6. Kiểm tra Dịch vụ Marketplace liên kết với Hướng dẫn viên
    const mktRes = await pool.query(`
      SELECT count(*) as total FROM "MarketplaceService" WHERE "localMateProfileId" IS NOT NULL
    `);
    const totalLinkedServices = Number(mktRes.rows[0].total);
    console.log(`\n6. Dịch vụ Marketplace liên kết LocalMate: ${totalLinkedServices}/${totalGuides}`);
    if (totalLinkedServices < totalGuides) {
      throw new Error(`Thiếu dịch vụ Marketplace cho LocalMate: ${totalLinkedServices}/${totalGuides}`);
    }

    console.log("\n=======================================================");
    console.log("XÁC MINH DỮ LIỆU TRI THỨC AI THÀNH CÔNG RỰC RỠ 100%!");
    console.log("=======================================================");
  } finally {
    await pool.end();
  }
}

verifyAiKnowledge().catch((err) => {
  console.error("Xác minh thất bại:", err);
  process.exit(1);
});
