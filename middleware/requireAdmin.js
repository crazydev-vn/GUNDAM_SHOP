// ============================================================
// middleware/requireAdmin.js
// VAI TRÒ: "người gác cổng" bảo vệ các API chỉ dành cho quản trị viên
// (xem danh sách đơn hàng, xóa sản phẩm, xóa đơn hàng...).
// Trước đây hàm này nằm trong orders.routes.js, giờ tách ra để
// products.routes.js và orders.routes.js cùng dùng, khỏi viết lặp.
// ============================================================

// Middleware là hàm có 3 tham số (req, res, next):
//   - req: request khách gửi lên
//   - res: dùng để trả lời khách
//   - next(): cho request đi tiếp vào route phía sau
// Chỉ cho qua khi request có header "x-admin-key" đúng bằng ADMIN_KEY trong file .env.
module.exports = function requireAdmin(req, res, next) {
    const adminKey = process.env.ADMIN_KEY; // khóa bí mật cấu hình trong .env

    // Chưa đặt ADMIN_KEY trong .env -> tắt hẳn chức năng quản trị cho an toàn
    if (!adminKey) {
        return res.status(403).json({ error: "Chức năng quản trị chưa được bật." });
    }

    // Có ADMIN_KEY nhưng khách gửi sai hoặc không gửi -> 401 (chưa xác thực)
    if (req.get("x-admin-key") !== adminKey) {
        return res.status(401).json({ error: "Không có quyền truy cập." });
    }

    next(); // hợp lệ -> đi tiếp vào route bên dưới
};