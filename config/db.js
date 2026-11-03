// config/db.js
// VAI TRÒ: mở kết nối từ server Node tới MongoDB (nơi chứa dữ liệu thật).
// Chỉ mở 1 lần lúc khởi động, sau đó mọi file khác dùng chung kết nối này.

const mongoose = require("mongoose"); // thư viện giúp JS nói chuyện với MongoDB

async function connectDB() {
    // Địa chỉ database: lấy từ file .env (MONGODB_URI),
    // nếu không có thì dùng MongoDB chạy trên máy bạn (cổng 27017).
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dacsantaynguyen";

    try {
        await mongoose.connect(uri); // chờ kết nối xong mới đi tiếp
        console.log("✅ Đã kết nối MongoDB:", mongoose.connection.name);
    } catch (error) {
        console.error("❌ Lỗi kết nối MongoDB:", error.message);
        // Không có database thì server không hoạt động được -> tắt tiến trình
        process.exit(1);
    }
}

module.exports = connectDB; // để server.js và seedProducts.js gọi lại