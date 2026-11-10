// server.js: cửa vào của toàn bộ trang khi chạy
// npm start -> node chạy server.js:
// 1. Kết nối MongoDB (config/db.js)
// 2. Cung cấp API (/api/products; /api/orders; /api/shipments; /api/health)
// 3. Trả các file html/css/js/ảnh trong folder public
// 4. Dữ liệu sản phẩm/đơn hàng nằm trong MongoDB thay vì file JSON

// Nạp các biến môi trường từ file .env vào process.env
// (MONGODB_URI, PORT, ADMIN_KEY...) - phải gọi TRƯỚC khi dùng process.env.
// require("dotenv").config() đọc file .env ở thư mục gốc dự án.
require("dotenv").config(); // nạp biến từ file .env (MONGODB_URI, PORT, ADMIN_KEY...)

// Import Express - framework web chính của server
const express = require("express");
// Import path - xử lý đường dẫn file/thư mục (an toàn cross-platform)
const path = require("path");
// Import cors - middleware cho phép trình duyệt ở origin khác gọi API
// (khi dev dùng Live Server cổng 5501 gọi sang server Node cổng 3000)
const cors = require("cors"); // cho phép gọi API khác cổng (khi dùng Live Server)
// Import mongoose - dùng để kiểm tra trạng thái kết nối ở /api/health
const mongoose = require("mongoose"); // [MỚI] dùng để kiểm tra trạng thái kết nối ở /api/health
// Import hàm kết nối MongoDB (được định nghĩa trong config/db.js)
const connectDB = require("./config/db");

// Mỗi file router xử lý 1 nhóm API giúp server.js gọn + dễ cập nhật
// - productsRouter: CRUD mô hình pre-order
// - ordersRouter: đặt cọc, tra cứu, quản lý đơn
// - shipmentsRouter: lô hàng nhập (chỉ admin)
const productsRouter = require("./routes/products.routes");
const ordersRouter = require("./routes/orders.routes");
const shipmentsRouter = require("./routes/shipments.routes");

// Tạo ứng dụng Express - đối tượng trung tâm xử lý request/response
const app = express();
// Cổng server lắng nghe: ưu tiên biến môi trường PORT, mặc định 3000
const PORT = process.env.PORT || 3000;

// Cho phép trang ở cổng khác (vd Live Server 5501) gọi API này
// cors() với không tham số = cho phép TẤT CẢ origin (phù hợp môi trường dev;
// production nên cấu hình origin cụ thể để bảo mật).
app.use(cors());

// express.json() là middleware: MỌI request đi qua đây trước khi tới route.
// Nó đọc phần "body" thô (chuỗi JSON) client gửi lên, parse thành object JS
// và gán vào req.body - thiếu dòng này thì req.body sẽ là undefined.
// (Chỉ parse khi Content-Type: application/json)
app.use(express.json());

// [MỚI] GET /api/health: kiểm tra server còn sống và database có đang kết nối không.
// readyState === 1 nghĩa là MongoDB đã kết nối. Hữu ích khi deploy/giám sát.
// - mongoose.connection.readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
// - Trả 200 nếu DB ok, 503 (Service Unavailable) nếu DB mất kết nối
// - uptime: số giây server đã chạy (dùng cho monitoring, load balancer healthcheck)
app.get("/api/health", (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
        status: dbConnected ? "ok" : "database_unavailable",
        uptime: Math.round(process.uptime()), // số giây server đã chạy
    });
});

// Gắn router vào các API - bước "định tuyến": request tới đúng tiền tố
// (/api/products hay /api/orders) sẽ được chuyển cho file router tương ứng.
// Ví dụ: GET /api/products/5 -> productsRouter xử lý tiếp phần "/5".
app.use("/api/products", productsRouter); // GET/POST/PUT/DELETE /api/products
app.use("/api/orders", ordersRouter);     // POST/GET/PATCH/DELETE /api/orders
app.use("/api/shipments", shipmentsRouter); // lô hàng nhập (chỉ admin)

// [MỚI] Đường dẫn /api/... không tồn tại -> trả JSON lỗi 404.
// Phải đặt TRƯỚC fallback bên dưới, nếu không API sai đường dẫn sẽ bị trả nhầm trang index.html.
// Lý do: middleware chạy theo thứ tự khai báo. Nếu đặt sau fallback "*",
// request /api/xxx (không khớp router nào) sẽ rơi vào "*" và trả index.html (sai).
app.use("/api", (req, res) => {
    res.status(404).json({ error: "API không tồn tại" });
});

// Biến thư mục "public" thành trang web (html, css, js, ảnh nằm trong đó)
// express.static tự phục vụ file tĩnh: /style.css -> public/style.css, /images/a.png -> public/images/a.png...
// Nếu không tìm thấy file tĩnh -> next() sang middleware tiếp theo (fallback bên dưới).
app.use(express.static(path.join(__dirname, "public")));

// Fallback: nếu gõ sai đường dẫn trang thì đưa về trang chủ
// app.get("*", ...) khớp MỌI GET request chưa được xử lý trước đó.
// Nhờ vậy SPA-style routing (product-detail.html?id=...) vẫn hoạt động dù gõ sai.
// LƯU Ý: phải đặt SAU tất cả route API và static.
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Kết nối MongoDB xong mới mở server, tránh trường hợp có request tới
// nhưng database chưa sẵn sàng (await connectDB() sẽ "đứng chờ" tới khi
// kết nối thành công hoặc lỗi; app.listen() chỉ chạy sau đó).
// - Nếu connectDB() throw lỗi: start() reject, server KHÔNG được mở
//   -> tốt hơn là mở server rồi mới phát hiện DB chết.
async function start() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`✅ Server đang chạy tại: http://localhost:${PORT}`);
    });
}

// Gọi hàm start() để khởi động toàn bộ server
start();