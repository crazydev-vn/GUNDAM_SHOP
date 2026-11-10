// config/db.js
// VAI TRÒ: mở kết nối từ server Node tới MongoDB (nơi chứa dữ liệu thật).
// Chỉ mở 1 lần lúc khởi động, sau đó mọi file khác dùng chung kết nối này.
// Mongoose giữ 1 "connection pool" bên trong, nên không cần mở lại nhiều lần.

const mongoose = require("mongoose"); // thư viện giúp JS nói chuyện với MongoDB

// Hàm async vì mongoose.connect() trả về Promise (kết nối mạng mất thời gian)
async function connectDB() {
    // Địa chỉ database: lấy từ file .env (MONGODB_URI),
    // nếu không có thì dùng MongoDB chạy trên máy bạn (cổng 27017).
    // "dacsantaynguyen" là tên database sẽ được tạo tự động nếu chưa có.
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dacsantaynguyen";

    try {
        await mongoose.connect(uri); // chờ kết nối xong mới đi tiếp (await = đợi Promise)
        // mongoose.connection.name là tên database vừa kết nối -> in ra để kiểm tra
        console.log("✅ Đã kết nối MongoDB:", mongoose.connection.name);
    } catch (error) {
        // Bắt mọi lỗi: sai URI, MongoDB chưa bật, sai mật khẩu...
        console.error("❌ Lỗi kết nối MongoDB:", error.message);
        // Không có database thì server không hoạt động được -> tắt tiến trình
        // exit(1) = thoát với mã lỗi, để nodemon/PM2 biết mà báo động
        process.exit(1);
    }
}

module.exports = connectDB; // để server.js và seedProducts.js gọi lại