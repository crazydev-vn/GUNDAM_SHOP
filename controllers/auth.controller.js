// ============================================================
// controllers/auth.controller.js
// VAI TRÒ: Điều khiển các hành động Xác thực người dùng (Auth)
//   - Đăng ký tài khoản (Khách hàng / Admin)
//   - Đăng nhập (Sinh mã JWT Token)
//   - Lấy thông tin tài khoản hiện tại (Profile / Me)
//   - Cập nhật thông tin cá nhân
// ============================================================

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_SECRET } = require("../middleware/auth");

function generateToken(user) {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role,
            name: user.name,
            phone: user.phone,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
}

// POST /api/auth/register
exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, address, role } = req.body || {};

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: "Họ tên phải có ít nhất 2 ký tự." });
        }
        if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) {
            return res.status(400).json({ error: "Email không đúng định dạng." });
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự." });
        }
        if (!phone || !/^[0-9]{10}$/.test(phone.trim())) {
            return res.status(400).json({ error: "Số điện thoại phải gồm đúng 10 chữ số." });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ error: "Email này đã được đăng ký tài khoản." });
        }

        // Chỉ cho phép đăng ký admin nếu có cờ xác nhận hoặc mặc định là customer
        const userRole = role === "admin" ? "admin" : "customer";

        const user = new User({
            name: name.trim(),
            email: normalizedEmail,
            password,
            phone: phone.trim(),
            address: address ? address.trim() : "",
            role: userRole,
        });

        await user.save();
        const token = generateToken(user);

        return res.status(201).json({
            message: "Đăng ký tài khoản thành công.",
            token,
            user,
        });
    } catch (err) {
        console.error("Lỗi đăng ký:", err);
        return res.status(500).json({ error: "Lỗi server khi đăng ký tài khoản." });
    }
};

// POST /api/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ error: "Vui lòng nhập đầy đủ Email và Mật khẩu." });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(401).json({ error: "Email hoặc mật khẩu không chính xác." });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Email hoặc mật khẩu không chính xác." });
        }

        const token = generateToken(user);

        return res.json({
            message: "Đăng nhập thành công.",
            token,
            user,
        });
    } catch (err) {
        console.error("Lỗi đăng nhập:", err);
        return res.status(500).json({ error: "Lỗi server khi đăng nhập." });
    }
};

// GET /api/auth/me
exports.getProfile = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: "Chưa đăng nhập." });
        }
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "Không tìm thấy người dùng." });
        }
        return res.json(user);
    } catch (err) {
        console.error("Lỗi lấy thông tin cá nhân:", err);
        return res.status(500).json({ error: "Lỗi server khi lấy thông tin cá nhân." });
    }
};

// PUT /api/auth/me
exports.updateProfile = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: "Chưa đăng nhập." });
        }

        const { name, phone, address } = req.body || {};
        const updates = {};

        if (name !== undefined) {
            if (name.trim().length < 2) return res.status(400).json({ error: "Họ tên quá ngắn." });
            updates.name = name.trim();
        }
        if (phone !== undefined) {
            if (!/^[0-9]{10}$/.test(phone.trim())) return res.status(400).json({ error: "Số điện thoại phải gồm 10 chữ số." });
            updates.phone = phone.trim();
        }
        if (address !== undefined) {
            updates.address = address.trim();
        }

        const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
        return res.json({ message: "Cập nhật thành công.", user: updatedUser });
    } catch (err) {
        console.error("Lỗi cập nhật hồ sơ:", err);
        return res.status(500).json({ error: "Lỗi server khi cập nhật hồ sơ." });
    }
};
