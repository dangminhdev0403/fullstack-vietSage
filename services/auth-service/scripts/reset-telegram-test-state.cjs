const { Client } = require("pg");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allGuides = args.includes("--all");

// Optional custom target email or code: --email=xyz@domain.com, --code=LM-QN-002
const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1];
const codeArg = args.find((a) => a.startsWith("--code="))?.split("=")[1];
const targetEmail = emailArg || "lan.nguyen@localmate.vietsage.vn";
const targetCode = codeArg || "LM-QN-001";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set in environment");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function run() {
  await client.connect();
  console.log("=================================================");
  console.log("   VIETSAGE LOCALMATE TELEGRAM STATE RESET TOOL   ");
  console.log("=================================================");
  console.log(`Mode: ${apply ? "🚀 APPLY (MODIFY DATABASE)" : "🔍 DRY-RUN (CHECK ONLY)"}`);
  console.log(`Target: ${allGuides ? "🌐 TẤT CẢ HƯỚNG DẪN VIÊN (--all)" : `👤 Hướng dẫn viên: ${targetEmail} / ${targetCode}`}`);

  try {
    // 1. Locate Target Guide(s)
    let guideRes;
    if (allGuides) {
      guideRes = await client.query(
        `SELECT id, "guideCode", "fullName", email, "userId", status 
         FROM "LocalMateProfile" 
         ORDER BY "guideCode" ASC`
      );
    } else {
      guideRes = await client.query(
        `SELECT id, "guideCode", "fullName", email, "userId", status 
         FROM "LocalMateProfile" 
         WHERE email = $1 OR "guideCode" = $2`,
        [targetEmail, targetCode]
      );
    }

    if (guideRes.rows.length === 0) {
      console.log(`⚠️ Không tìm thấy Guide với email=${targetEmail} hoặc code=${targetCode}`);
      return;
    }

    const guideIds = guideRes.rows.map((g) => g.id);
    console.log(`\n📌 Danh sách Hướng dẫn viên tìm thấy (${guideRes.rows.length}):`);
    for (const g of guideRes.rows) {
      console.log(`   - [${g.guideCode}] ${g.fullName} (Email: ${g.email}, ID: ${g.id})`);
    }

    // 2. Check current Telegram Bindings
    const bindingRes = await client.query(
      `SELECT b.id, b."localMateProfileId", b."telegramUserId", b."telegramChatId", b."pairedAt", b."revokedAt", b."blockedAt", p."fullName", p."guideCode"
       FROM "LocalMateTelegramBinding" b
       JOIN "LocalMateProfile" p ON b."localMateProfileId" = p.id
       WHERE b."localMateProfileId" = ANY($1::text[])`,
      [guideIds]
    );

    console.log(`\n🔗 Trạng thái Telegram Binding hiện tại (${bindingRes.rows.length}):`);
    if (bindingRes.rows.length === 0) {
      console.log(`   -> TẤT CẢ ĐỀU CHƯA KẾT NỐI (Chưa có bản ghi LocalMateTelegramBinding nào)`);
    } else {
      for (const b of bindingRes.rows) {
        console.log(`   - Guide [${b.guideCode}] ${b.fullName}:`);
        console.log(`     + Telegram User ID: ${b.telegramUserId} | Chat ID: ${b.telegramChatId}`);
        console.log(`     + Trạng thái: ${b.revokedAt ? "ĐÃ HỦY LIÊN KẾT (Revoked)" : b.blockedAt ? "BỊ CHẶN (Blocked)" : "ĐANG HOẠT ĐỘNG (Active)"}`);
      }
    }

    // 3. Check Pairing Tokens
    const tokenRes = await client.query(
      `SELECT id, "localMateProfileId", "expiresAt", "consumedAt", "createdAt"
       FROM "LocalMateTelegramPairingToken"
       WHERE "localMateProfileId" = ANY($1::text[])
       ORDER BY "createdAt" DESC`,
      [guideIds]
    );
    console.log(`\n🎟️  Tổng số Pairing Tokens: ${tokenRes.rows.length}`);

    // 4. Check Orders assigned
    const orderRes = await client.query(
      `SELECT id, "orderNumber", status, "customerTotalAmount", "assignedLocalMateProfileId"
       FROM "MarketplaceOrder"
       WHERE "assignedLocalMateProfileId" = ANY($1::text[])
       ORDER BY "createdAt" DESC`,
      [guideIds]
    );
    console.log(`\n📦 Tổng số đơn hàng Marketplace đã gán: ${orderRes.rows.length}`);
    for (const o of orderRes.rows) {
      console.log(`   - Đơn ${o.orderNumber} | Guide ID: ${o.assignedLocalMateProfileId} | Trạng thái: ${o.status} | Tổng tiền: ${o.customerTotalAmount} VND`);
    }

    if (!apply) {
      console.log("\n-------------------------------------------------");
      console.log("ℹ️  Đây là chế độ KIỂM TRA (DRY-RUN). Chưa có dữ liệu nào bị thay đổi.");
      console.log("👉 Để XÓA và đưa về trạng thái CHƯA CẤU HÌNH, hãy thêm cờ --apply:");
      console.log("   node scripts/reset-telegram-test-state.cjs --apply");
      console.log("   (Hoặc thêm --all để xóa cho tất cả hướng dẫn viên)");
      console.log("-------------------------------------------------");
      return;
    }

    // ================= APPLY MODE: PERFORM CLEANUP =================
    console.log("\n⏳ Đang tiến hành xóa dữ liệu để đưa về trạng thái chưa cấu hình...");

    await client.query("BEGIN");

    // A. Xóa Telegram Binding
    const delBindingRes = await client.query(
      `DELETE FROM "LocalMateTelegramBinding" WHERE "localMateProfileId" = ANY($1::text[])`,
      [guideIds]
    );
    console.log(`   ✅ Đã xóa ${delBindingRes.rowCount} bản ghi LocalMateTelegramBinding.`);

    // B. Xóa Pairing Tokens
    const delTokensRes = await client.query(
      `DELETE FROM "LocalMateTelegramPairingToken" WHERE "localMateProfileId" = ANY($1::text[])`,
      [guideIds]
    );
    console.log(`   ✅ Đã xóa ${delTokensRes.rowCount} bản ghi LocalMateTelegramPairingToken.`);

    // C. Xóa các đơn hàng test và các bản ghi phụ thuộc
    if (orderRes.rows.length > 0) {
      const orderIds = orderRes.rows.map((r) => r.id);

      const delMsgs = await client.query(
        `DELETE FROM "MarketplaceConversationMessage" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delMsgs.rowCount} tin nhắn trong MarketplaceConversationMessage.`);

      const delConvs = await client.query(
        `DELETE FROM "MarketplaceConversation" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delConvs.rowCount} bản ghi MarketplaceConversation.`);

      const payRes = await client.query(
        `SELECT id FROM "MarketplaceOrderPayment" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      if (payRes.rows.length > 0) {
        const payIds = payRes.rows.map((p) => p.id);
        const delPayEvents = await client.query(
          `DELETE FROM "MarketplacePaymentProviderEvent" WHERE "paymentId" = ANY($1::text[])`,
          [payIds]
        );
        console.log(`   ✅ Đã xóa ${delPayEvents.rowCount} sự kiện MarketplacePaymentProviderEvent.`);
      }

      const delPayments = await client.query(
        `DELETE FROM "MarketplaceOrderPayment" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delPayments.rowCount} bản ghi MarketplaceOrderPayment.`);

      const delVouchers = await client.query(
        `DELETE FROM "ServiceVoucher" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delVouchers.rowCount} bản ghi ServiceVoucher.`);

      const delSettlements = await client.query(
        `DELETE FROM "MarketplaceSettlement" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delSettlements.rowCount} bản ghi MarketplaceSettlement.`);

      const delRevenues = await client.query(
        `DELETE FROM "MarketplaceRevenueEntry" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delRevenues.rowCount} bản ghi MarketplaceRevenueEntry.`);

      const delItems = await client.query(
        `DELETE FROM "MarketplaceOrderItem" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delItems.rowCount} bản ghi MarketplaceOrderItem.`);

      const delEvents = await client.query(
        `DELETE FROM "MarketplaceOrderEvent" WHERE "orderId" = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delEvents.rowCount} bản ghi MarketplaceOrderEvent.`);

      const delOrders = await client.query(
        `DELETE FROM "MarketplaceOrder" WHERE id = ANY($1::text[])`,
        [orderIds]
      );
      console.log(`   ✅ Đã xóa ${delOrders.rowCount} bản ghi MarketplaceOrder.`);
    }

    await client.query("COMMIT");

    console.log("\n🎉 HOÀN TẤT RESET TRẠNG THÁI!");
    console.log("Hệ thống đã trở về trạng thái 'CHƯA CẤU HÌNH / CHƯA KẾT NỐI TELEGRAM'.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Lỗi khi thực hiện reset:", err);
  } finally {
    await client.end();
  }
}

run();
