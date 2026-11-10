// ============================================================
// middleware/auth.js
// VAI TRÒ: Xác thực JSON Web Token (JWT) và kiểm tra phân quyền (RBAC)
// ============================================================

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "gundam_preorder_secret_jwt_2026";

// 1. Bắt buộc đã đăng nhập (phải có JWT token hợp lệ)
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.headers["x-auth-token"]) {
        token = req.headers["x-auth-token"];
    }

    if (!token) {
        return res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, role, phone, name }
        next();
    } catch (err) {
        return res.status(401).json({ error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ." });
    }
}

// 2. Không bắt buộc đăng nhập (cho phép khách vãng lai hoặc người đã đăng nhập)
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.headers["x-auth-token"]) {
        token = req.headers["x-auth-token"];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (err) {
            req.user = null;
        }
    }
    next();
}

// 3. Quyền Admin: hỗ trợ cả Token có role 'admin' VÀ fallback 'x-admin-key'
function requireAdmin(req, res, next) {
    // Cách 1: Qua JWT Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.role === "admin") {
                req.user = decoded;
                return next();
            } else if (decoded && decoded.role !== "admin") {
                return res.status(403).json({ error: "Tài khoản của bạn không có quyền Quản trị viên." });
            }
        } catch (err) {
            // Token lỗi -> báo 401
            return res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn." });
        }
    }

    // Cách 2: Qua x-admin-key trong file .env (hỗ trợ script test & admin panel cũ)
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && req.get("x-admin-key") === adminKey) {
        req.user = { role: "admin", isApiKey: true };
        return next();
    }

    // Không gửi token và không có admin-key hợp lệ -> 401 Unauthorized
    return res.status(401).json({ error: "Không có quyền truy cập. Vui lòng đăng nhập hoặc cung cấp khóa quản trị." });
}

module.exports = {
    verifyToken,
    optionalAuth,
    requireAdmin,
    JWT_SECRET,
};
