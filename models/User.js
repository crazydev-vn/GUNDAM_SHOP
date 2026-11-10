// ============================================================
// models/User.js
// VAI TRÒ: Khuôn mẫu tài khoản người dùng và quản trị viên
//   - role: "customer" (khách hàng mua/đặt cọc) hoặc "admin" (quản trị viên)
//   - password: lưu hash bằng bcryptjs, không lưu mật khẩu thô
// ============================================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const USER_ROLES = ["customer", "admin"];

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Họ tên không được để trống"],
            trim: true,
            minlength: [2, "Họ tên phải có ít nhất 2 ký tự"],
        },
        email: {
            type: String,
            required: [true, "Email không được để trống"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Email không đúng định dạng"],
        },
        password: {
            type: String,
            required: [true, "Mật khẩu không được để trống"],
            minlength: [6, "Mật khẩu phải có ít nhất 6 ký tự"],
        },
        phone: {
            type: String,
            required: [true, "Số điện thoại không được để trống"],
            match: [/^[0-9]{10}$/, "Số điện thoại phải gồm đúng 10 chữ số"],
            trim: true,
        },
        address: {
            type: String,
            default: "",
            trim: true,
        },
        role: {
            type: String,
            enum: USER_ROLES,
            default: "customer",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Mã hóa mật khẩu trước khi lưu nếu mật khẩu bị thay đổi
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// So sánh mật khẩu nhập vào với mật khẩu đã băm trong database
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Loại bỏ mật khẩu khi serialize ra JSON
userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.password;
        return ret;
    },
});

const User = mongoose.model("User", userSchema);
User.USER_ROLES = USER_ROLES;

module.exports = User;
