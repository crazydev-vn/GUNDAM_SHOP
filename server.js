// server.js: cửa vào của toàn bộ trang khi chạy
// npm start -> node chạy server.js:
// 1. Kết nối MongoDB (config/db.js)
// 2. Cung cấp API (/api/products; /api/orders; /api/shipments; /api/health)
// 3. Trả các file html/css/js/ảnh trong folder public
// 4. Dữ liệu sản phẩm/đơn hàng nằm trong MongoDB thay vì file JSON

require("dotenv").config(); // nạp biến từ file .env (MONGODB_URI, PORT, ADMIN_KEY...)

const express = require("express");
const path = require("path");
const cors = require("cors"); // cho phép gọi API khác cổng (khi dùng Live Server)
const mongoose = require("mongoose"); // [MỚI] dùng để kiểm tra trạng thái kết nối ở /api/health
const connectDB = require("./config/db");

// Mỗi file router xử lý 1 nhóm API giúp server.js gọn + dễ cập nhật
const productsRouter = require("./routes/products.routes");
const ordersRouter = require("./routes/orders.routes");
const shipmentsRouter = require("./routes/shipments.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// Cho phép trang ở cổng khác (vd Live Server 5501) gọi API này
app.use(cors());

// express.json() là middleware: MỌI request đi qua đây trước khi tới route.
// Nó đọc phần "body" thô (chuỗi JSON) client gửi lên, parse thành object JS
// và gán vào req.body - thiếu dòng này thì req.body sẽ là undefined.
app.use(express.json());

// [MỚI] GET /api/health: kiểm tra server còn sống và database có đang kết nối không.
// readyState === 1 nghĩa là MongoDB đã kết nối. Hữu ích khi deploy/giám sát.
app.get("/api/health", (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
        status: dbConnected ? "ok" : "database_unavailable",
        uptime: Math.round(process.uptime()), // số giây server đã chạy
    });
});

// Gắn router vào các API - bước "định tuyến": request tới đúng tiền tố
// (/api/products hay /api/orders) sẽ được chuyển cho file router tương ứng.
app.use("/api/products", productsRouter); // GET/POST/PUT/DELETE /api/products
app.use("/api/orders", ordersRouter);     // POST/GET/PATCH/DELETE /api/orders
app.use("/api/shipments", shipmentsRouter); // lô hàng nhập (chỉ admin)

// [MỚI] Đường dẫn /api/... không tồn tại -> trả JSON lỗi 404.
// Phải đặt TRƯỚC fallback bên dưới, nếu không API sai đường dẫn sẽ bị trả nhầm trang index.html.
app.use("/api", (req, res) => {
    res.status(404).json({ error: "API không tồn tại" });
});

// Biến thư mục "public" thành trang web (html, css, js, ảnh nằm trong đó)
app.use(express.static(path.join(__dirname, "public")));

// Fallback: nếu gõ sai đường dẫn trang thì đưa về trang chủ
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Kết nối MongoDB xong mới mở server, tránh trường hợp có request tới
// nhưng database chưa sẵn sàng (await connectDB() sẽ "đứng chờ" tới khi
// kết nối thành công hoặc lỗi; app.listen() chỉ chạy sau đó).
async function start() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`✅ Server đang chạy tại: http://localhost:${PORT}`);
    });
}

start();