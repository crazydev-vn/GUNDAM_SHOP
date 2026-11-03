// scripts/seedProducts.js
// VAI TRÒ: đưa dữ liệu từ data/products.json VÀO MongoDB.
//
// Cách chạy:
//   npm run seed             -> thêm/cập nhật 6 mô hình pre-order mẫu (giữ nguyên sản phẩm thêm tay)
//   npm run seed:reset       -> XÓA SẠCH sản phẩm rồi nạp lại đúng như products.json
//   npm run seed:reset-all   -> như trên và XÓA LUÔN toàn bộ đơn hàng
//
// LƯU Ý: chạy lại sẽ đưa "remaining_slots" về số ghi trong products.json.
// Nếu database còn dữ liệu đặc sản/đơn cũ (price, stock...), hãy dùng seed:reset-all một lần.

require("dotenv").config(); // đọc file .env
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Product = require("../models/Product");
const Order = require("../models/Order");
const ShipmentBatch = require("../models/ShipmentBatch");

const args = process.argv.slice(2);
const RESET = args.includes("--reset");   // xóa hết sản phẩm trước khi nạp
const ORDERS = args.includes("--orders"); // xóa luôn đơn hàng

async function seed() {
    await connectDB(); // 1. kết nối MongoDB

    // 2. đọc file products.json thành mảng JS
    const filePath = path.join(__dirname, "..", "data", "products.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const products = JSON.parse(raw);

    // 3. (tùy chọn) dọn dữ liệu cũ để quay về trạng thái ban đầu
    if (RESET) {
        const del = await Product.deleteMany({});
        console.log(`🗑️  Đã xóa ${del.deletedCount} sản phẩm cũ.`);
    }
    if (ORDERS) {
        const delOrders = await Order.deleteMany({});
        console.log(`🗑️  Đã xóa ${delOrders.deletedCount} đơn hàng.`);
        const delBatches = await ShipmentBatch.deleteMany({});
        console.log(`🗑️  Đã xóa ${delBatches.deletedCount} lô hàng.`);
    }

    let created = 0;
    let updated = 0;

    // 4. với từng sản phẩm: có rồi thì cập nhật, chưa có thì thêm mới (upsert)
    for (const product of products) {
        const result = await Product.findOneAndUpdate(
            { id: product.id },
            { $set: product },
            { upsert: true, new: true, includeResultMetadata: true }
        );
        if (result.lastErrorObject && result.lastErrorObject.updatedExisting) {
            updated++;
        } else {
            created++;
        }
    }

    console.log(`✅ Seed hoàn tất: ${created} sản phẩm mới, ${updated} sản phẩm cập nhật.`);
    await mongoose.disconnect(); // 5. đóng kết nối rồi thoát
    process.exit(0);
}

seed().catch((error) => {
    console.error("❌ Lỗi khi seed dữ liệu:", error);
    process.exit(1);
});