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

// Nạp biến môi trường từ .env (MONGODB_URI...) - phải gọi TRƯỚC connectDB()
require("dotenv").config(); // đọc file .env
// fs: đọc/ghi file (ở đây dùng để đọc products.json)
const fs = require("fs");
// path: xử lý đường dẫn file cross-platform
const path = require("path");
// mongoose: dùng để ngắt kết nối sau khi seed xong
const mongoose = require("mongoose");
// Hàm kết nối MongoDB (dùng chung với server.js)
const connectDB = require("../config/db");
// Model Product - thao tác collection sản phẩm
const Product = require("../models/Product");
// Model Order - dùng khi cần xóa đơn hàng (--orders)
const Order = require("../models/Order");
// Model ShipmentBatch - dùng khi cần xóa lô hàng (--orders)
const ShipmentBatch = require("../models/ShipmentBatch");

// Lấy các đối số dòng lệnh sau "node scripts/seedProducts.js"
// Ví dụ: npm run seed:reset -> script "node scripts/seedProducts.js --reset"
//        process.argv = ["node", "scripts/seedProducts.js", "--reset"]
//        slice(2) = ["--reset"]
const args = process.argv.slice(2);
// Cờ --reset: xóa hết sản phẩm trước khi nạp
const RESET = args.includes("--reset");   // xóa hết sản phẩm trước khi nạp
// Cờ --orders: xóa luôn đơn hàng + lô hàng
const ORDERS = args.includes("--orders"); // xóa luôn đơn hàng

// Hàm chính thực hiện seed (bất đồng bộ vì thao tác DB)
async function seed() {
    await connectDB(); // 1. kết nối MongoDB

    // 2. đọc file products.json thành mảng JS
    // - __dirname = thư mục chứa file hiện tại (scripts/)
    // - ".." lùi lên thư mục gốc dự án
    // - "data/products.json" là đường dẫn tới file dữ liệu mẫu
    const filePath = path.join(__dirname, "..", "data", "products.json");
    // readFileSync: đọc đồng bộ (OK vì chỉ chạy 1 lần lúc khởi động script)
    const raw = fs.readFileSync(filePath, "utf-8");
    // Parse chuỗi JSON thành mảng object
    const products = JSON.parse(raw);

    // 3. (tùy chọn) dọn dữ liệu cũ để quay về trạng thái ban đầu
    // - deleteMany({}) với filter rỗng = xóa TOÀN BỘ document trong collection
    if (RESET) {
        const del = await Product.deleteMany({});
        console.log(`🗑️  Đã xóa ${del.deletedCount} sản phẩm cũ.`);
    }
    // Nếu có cờ --orders: xóa đơn hàng + lô hàng
    // (xóa lô trước hay sau không quan trọng vì không có ràng buộc FK cứng trong MongoDB)
    if (ORDERS) {
        const delOrders = await Order.deleteMany({});
        console.log(`🗑️  Đã xóa ${delOrders.deletedCount} đơn hàng.`);
        const delBatches = await ShipmentBatch.deleteMany({});
        console.log(`🗑️  Đã xóa ${delBatches.deletedCount} lô hàng.`);
    }

    // Biến đếm để báo cáo kết quả cuối
    let created = 0;
    let updated = 0;

    // 4. với từng sản phẩm: có rồi thì cập nhật, chưa có thì thêm mới (upsert)
    for (const product of products) {
        // findOneAndUpdate với upsert: true
        // - Nếu tìm thấy document có id = product.id -> cập nhật bằng $set
        // - Nếu KHÔNG tìm thấy -> tạo mới document với dữ liệu product
        // - includeResultMetadata: true -> trả về metadata (lastErrorObject...) thay vì chỉ document
        //   (cần metadata để biết là "tạo mới" hay "cập nhật")
        const result = await Product.findOneAndUpdate(
            { id: product.id },                                // điều kiện tìm
            { $set: product },                                 // dữ liệu cập nhật/tạo
            { upsert: true, new: true, includeResultMetadata: true } // tùy chọn
        );
        // lastErrorObject.updatedExisting = true -> đã tồn tại và được cập nhật
        // ngược lại -> vừa được tạo mới
        if (result.lastErrorObject && result.lastErrorObject.updatedExisting) {
            updated++;
        } else {
            created++;
        }
    }

    // In báo cáo tổng kết
    console.log(`✅ Seed hoàn tất: ${created} sản phẩm mới, ${updated} sản phẩm cập nhật.`);
    await mongoose.disconnect(); // 5. đóng kết nối rồi thoát
    // process.exit(0) = thoát thành công (exit code 0)
    // Nếu không gọi, Node có thể treo vì mongoose còn giữ handle mở
    process.exit(0);
}

// Gọi seed() và xử lý lỗi
// - Nếu seed() throw -> in lỗi và thoát với code 1 (báo hiệu thất bại cho CI/CD)
// - Nếu thành công -> seed() đã tự gọi process.exit(0) bên trong
seed().catch((error) => {
    console.error("❌ Lỗi khi seed dữ liệu:", error);
    process.exit(1);
}); 