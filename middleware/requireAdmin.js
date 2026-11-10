// ============================================================
// middleware/requireAdmin.js (wrapper chuyển tiếp sang middleware/auth.js)
// ============================================================

<<<<<<< HEAD
// Middleware là hàm có 3 tham số (req, res, next):
//   - req: request khách gửi lên (chứa headers, body, query...)
//   - res: dùng để trả lời khách (res.json, res.status...)
//   - next(): cho request đi tiếp vào route phía sau
// Chỉ cho qua khi request có header "x-admin-key" đúng bằng ADMIN_KEY trong file .env.
module.exports = function requireAdmin(req, res, next) {
    const adminKey = process.env.ADMIN_KEY; // khóa bí mật cấu hình trong .env

    // Chưa đặt ADMIN_KEY trong .env -> tắt hẳn chức năng quản trị cho an toàn
    // (tránh trường hợp so sánh undefined === undefined lại thành công)
    if (!adminKey) {
        return res.status(403).json({ error: "Chức năng quản trị chưa được bật." });
    }

    // Có ADMIN_KEY nhưng khách gửi sai hoặc không gửi -> 401 (chưa xác thực)
    // req.get("x-admin-key") đọc header tên "x-admin-key" (không phân biệt hoa thường)
    if (req.get("x-admin-key") !== adminKey) {
        return res.status(401).json({ error: "Không có quyền truy cập." });
    }

    next(); // hợp lệ -> đi tiếp vào route bên dưới (route thật sự xử lý)
};
=======
const { requireAdmin } = require("./auth");

module.exports = requireAdmin;
>>>>>>> 6b3caaf20fb18e1fa36b22c31cec5ae052644462
