// ============================================================
// tests/testAuth.js
// VAI TRÒ: Kiểm thử tự động hệ thống Xác thực (Auth) & Phân quyền (RBAC)
// ============================================================

require("dotenv").config();

const BASE = process.argv[2] || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } else {
        failed++;
        console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? "  -> " + JSON.stringify(detail) : ""}`);
    }
}
const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

async function call(method, path, { body, token, key } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (key) headers["x-admin-key"] = key;

    const response = await fetch(BASE + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
}

async function main() {
    console.log(`Bắt đầu kiểm thử Auth tại ${BASE}`);

    try {
        const testStamp = Date.now();
        const testUser = {
            name: "Tester PreOrder",
            email: `tester_${testStamp}@example.com`,
            password: "password123",
            phone: "0987654321",
            address: "123 Đường Test, Hà Nội",
        };

        const testAdmin = {
            name: "Admin PreOrder",
            email: `admin_${testStamp}@example.com`,
            password: "adminpassword123",
            phone: "0911223344",
            role: "admin",
        };

        // 1. Đăng ký tài khoản
        section("1. Đăng ký tài khoản (Register)");
        const regCustomer = await call("POST", "/api/auth/register", { body: testUser });
        check("Đăng ký User hợp lệ -> 201", regCustomer.status === 201 && Boolean(regCustomer.data.token), regCustomer.data);

        const customerToken = regCustomer.data.token;

        const regDup = await call("POST", "/api/auth/register", { body: testUser });
        check("Đăng ký trùng email -> 400", regDup.status === 400);

        const regAdmin = await call("POST", "/api/auth/register", { body: testAdmin });
        check("Đăng ký Admin hợp lệ -> 201", regAdmin.status === 201 && regAdmin.data.user.role === "admin", regAdmin.data);
        const adminToken = regAdmin.data.token;

        // 2. Đăng nhập
        section("2. Đăng nhập (Login)");
        const loginFail = await call("POST", "/api/auth/login", {
            body: { email: testUser.email, password: "wrongpassword" },
        });
        check("Đăng nhập sai mật khẩu -> 401", loginFail.status === 401);

        const loginOk = await call("POST", "/api/auth/login", {
            body: { email: testUser.email, password: testUser.password },
        });
        check("Đăng nhập đúng mật khẩu -> 200, có token", loginOk.status === 200 && Boolean(loginOk.data.token));

        // 3. Thông tin cá nhân & Quyền hạn
        section("3. Thông tin tài khoản & Token (Me / Profile)");
        const meNoToken = await call("GET", "/api/auth/me");
        check("Xem Profile không kèm token -> 401", meNoToken.status === 401);

        const meWithToken = await call("GET", "/api/auth/me", { token: customerToken });
        check("Xem Profile kèm Bearer Token -> 200", meWithToken.status === 200 && meWithToken.data.email === testUser.email);
        check("Không để lộ mật khẩu trong Profile", meWithToken.data.password === undefined);

        // 4. Phân quyền (RBAC)
        section("4. Kiểm tra phân quyền (RBAC)");
        const userAccessAdminRoute = await call("GET", "/api/orders", { token: customerToken });
        check("User thường gọi API Admin -> 403 Bị cấm", userAccessAdminRoute.status === 403);

        const adminAccessAdminRoute = await call("GET", "/api/orders", { token: adminToken });
        check("Admin dùng JWT Token gọi API Admin -> 200 Thành công", adminAccessAdminRoute.status === 200);

        // 5. User đặt hàng và xem đơn của tôi
        section("5. Đơn hàng của User (My Orders)");
        const myOrders = await call("GET", "/api/orders/my-orders", { token: customerToken });
        check("Xem đơn của tôi qua token -> 200", myOrders.status === 200 && Array.isArray(myOrders.data));

        console.log(`\n\x1b[1mKết quả kiểm thử Auth: ${passed} đạt, ${failed} lỗi\x1b[0m`);
    } catch (err) {
        console.error("Lỗi khi chạy kiểm thử:", err);
    }
}

main();
