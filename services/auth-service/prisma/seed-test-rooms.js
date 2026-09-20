const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, RoomStatus, RoomQRCodeStatus } = require("@prisma/client");
const crypto = require("crypto");
require("dotenv").config({ path: __dirname + "/../.env" });

async function seedTestRooms() {
  const adapter = new PrismaPg(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  try {
    const hotel = await prisma.hotel.findFirst({
      where: { code: "HCA_HOMESTAY" },
    });

    if (!hotel) {
      throw new Error("Không tìm thấy khách sạn HCA_HOMESTAY. Hãy chạy seed HCA trước.");
    }

    const roomConfigs = [
      { roomNumber: "101", floor: "1", type: "Phòng Tiêu chuẩn Double", price: 500000 },
      { roomNumber: "102", floor: "1", type: "Phòng Tiêu chuẩn Twin", price: 550000 },
      { roomNumber: "103", floor: "1", type: "Phòng Superior Double", price: 600000 },
      { roomNumber: "104", floor: "1", type: "Phòng Superior Twin", price: 650000 },
      { roomNumber: "105", floor: "1", type: "Phòng Deluxe City View", price: 750000 },
      { roomNumber: "201", floor: "2", type: "Phòng Deluxe Balcony", price: 800000 },
      { roomNumber: "202", floor: "2", type: "Phòng Family Suite (4 khách)", price: 1100000 },
      { roomNumber: "203", floor: "2", type: "Phòng Studio Kitchenette", price: 900000 },
      { roomNumber: "204", floor: "2", type: "Phòng Executive King", price: 1200000 },
      { roomNumber: "205", floor: "2", type: "Phòng Penthouse Terrace View", price: 1500000 },
    ];

    const results = [];

    for (const config of roomConfigs) {
      const code = `HCA_ROOM_${config.roomNumber}_${hotel.id.slice(-6)}`;
      const room = await prisma.room.upsert({
        where: {
          hotelId_roomNumber: {
            hotelId: hotel.id,
            roomNumber: config.roomNumber,
          },
        },
        update: {
          floor: config.floor,
          type: config.type,
          price: config.price,
          status: RoomStatus.AVAILABLE,
          maxActiveGuestDevices: 4,
        },
        create: {
          hotelId: hotel.id,
          code,
          roomNumber: config.roomNumber,
          floor: config.floor,
          type: config.type,
          price: config.price,
          status: RoomStatus.AVAILABLE,
          maxActiveGuestDevices: 4,
        },
      });

      // Ensure each room has an active QR code
      const existingQr = await prisma.roomQRCode.findFirst({
        where: { roomId: room.id },
      });

      if (!existingQr) {
        const publicCode = `VS-QR-${hotel.code}-${config.roomNumber}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        await prisma.roomQRCode.create({
          data: {
            hotelId: hotel.id,
            roomId: room.id,
            publicCode,
            status: RoomQRCodeStatus.ACTIVE,
            activatedAt: new Date(),
          },
        });
      }

      results.push({
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        type: room.type,
        price: Number(room.price),
        status: room.status,
      });
    }

    console.log(`Đã tạo/cập nhật thành công ${results.length} phòng cho khách sạn ${hotel.name} (${hotel.code}):`);
    console.table(results);
    return results;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedTestRooms()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Lỗi tạo phòng test:", err);
      process.exit(1);
    });
}

module.exports = { seedTestRooms };
