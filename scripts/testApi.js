// ============================================================
// scripts/testApi.js
// VAI TRÒ: kiểm thử API bằng terminal, đi hết luồng đặt cọc pre-order:
//   sản phẩm -> đặt cọc -> tra cứu -> admin duyệt -> lô hàng -> giao xong.
//
// Cách chạy (server phải đang chạy bằng "npm run dev" ở cửa sổ terminal khác):
//   node scripts/testApi.js
//   node scripts/testApi.js http://localhost:3000   (đổi địa chỉ server nếu cần)
//
// Cần ADMIN_KEY trong file .env. Script tự tạo 1 sản phẩm "TEST ..." riêng để thử
// và XÓA hết dữ liệu test khi xong, không đụng tới sản phẩm thật.
// Yêu cầu Node 18 trở lên (có sẵn fetch).
// ============================================================

require("dotenv").config();

const BASE = process.argv[2] || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const ADMIN_KEY = process.env.ADMIN_KEY;

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

async function call(method, path, { body, key } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (key !== undefined) headers["x-admin-key"] = key;
    const response = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
}
const pub = (method, path, body) => call(method, path, { body });
const admin = (method, path, body) => call(method, path, { body, key: ADMIN_KEY });

const PHONE = "0912345678";
const ADDRESS = "123 Đường Thử Nghiệm, Quận 1, TP.HCM";
const code = (order) => String(order._id).slice(-6).toUpperCase();

async function main() {
    console.log(`Kiểm thử API tại ${BASE}`);

    // ---------- 0. Chuẩn bị ----------
    section("0. Kết nối server");
    let health;
    try {
        health = await pub("GET", "/api/health");
    } catch (error) {
        console.log("\x1b[31mKhông kết nối được server. Hãy chạy \"npm run dev\" ở cửa sổ terminal khác rồi thử lại.\x1b[0m");
        process.exit(1);
    }
    check("GET /api/health -> 200, database ok", health.status === 200 && health.data.status === "ok", health);
    if (!ADMIN_KEY) {
        console.log("\x1b[31mChưa có ADMIN_KEY trong .env nên không kiểm thử được phần quản trị.\x1b[0m");
        process.exit(1);
    }

    const created = { product: null, orders: [], batch: null };

    try {
        // ---------- 1. Quyền admin ----------
        section("1. Quyền admin");
        check("Không có khóa -> 401", (await pub("GET", "/api/orders")).status === 401);
        check("Sai khóa -> 401", (await call("GET", "/api/orders", { key: "sai-khoa" })).status === 401);
        check("Đúng khóa -> 200", (await admin("GET", "/api/orders")).status === 200);
        check("Đường dẫn API lạ -> 404 JSON", (await pub("GET", "/api/khong-ton-tai")).status === 404);

        // ---------- 2. Sản phẩm ----------
        section("2. Sản phẩm pre-order");
        const stamp = Date.now();
        const productBody = {
            name: `TEST Gundam ${stamp}`,
            category: "hg",
            deposit_price: 50000,   // cọc tối thiểu 50% giá tổng
            total_price: 100000,
            total_slots: 5,
            cut_off_date: new Date(Date.now() + 30 * 86400000).toISOString(),
            release_quarter_year: "Q4/2027",
            variants_bonus: ["Quà test"],
            image: "images/gundam1.png",
            description: "Sản phẩm dùng để kiểm thử, sẽ tự xóa.",
        };
        check("Thêm sản phẩm không có khóa -> 401", (await pub("POST", "/api/products", productBody)).status === 401);
        check("Giá cọc lớn hơn giá tổng -> 400", (await admin("POST", "/api/products", { ...productBody, deposit_price: 999999 })).status === 400);
        check("Danh mục sai -> 400", (await admin("POST", "/api/products", { ...productBody, category: "xyz" })).status === 400);
        check("Quý phát hành sai định dạng -> 400", (await admin("POST", "/api/products", { ...productBody, release_quarter_year: "2027" })).status === 400);

        const add = await admin("POST", "/api/products", productBody);
        check("Thêm sản phẩm hợp lệ -> 201", add.status === 201, add.data);
        created.product = add.data;
        const pid = add.data.id;
        check("remaining_slots mặc định = total_slots", add.data.remaining_slots === 5);
        check("po_status = Open", add.data.po_status === "Open", add.data.po_status);
        check("Không lộ _id", add.data._id === undefined);

        const detail = await pub("GET", `/api/products/${pid}`);
        check("GET /api/products/:id -> 200", detail.status === 200 && detail.data.name === productBody.name);
        check("GET sản phẩm không tồn tại -> 404", (await pub("GET", "/api/products/999999")).status === 404);
        check("GET id sai định dạng -> 400", (await pub("GET", "/api/products/abc")).status === 400);

        const list = await pub("GET", "/api/products?category=hg&price=under-500");
        check("Lọc category + khoảng giá có sản phẩm test", list.data.some((p) => p.id === pid));
        const searched = await pub("GET", `/api/products?search=${encodeURIComponent("TEST Gundam " + stamp)}`);
        check("Tìm theo tên", searched.data.length === 1 && searched.data[0].id === pid);
        const paged = await pub("GET", "/api/products?page=1&limit=2");
        check("Phân trang trả { data, total, totalPages }", Array.isArray(paged.data.data) && paged.data.limit === 2, paged.data);

        // ---------- 3. Đặt cọc: kiểm tra đầu vào ----------
        section("3. Đặt cọc: kiểm tra dữ liệu");
        const baseOrder = { customerName: "Nguyen Van Test", phone: PHONE, address: "", note: "", deposit_tier: 50, cart: [{ id: pid, quantity: 1 }] };
        check("Giỏ trống -> 400", (await pub("POST", "/api/orders", { ...baseOrder, cart: [] })).status === 400);
        check("Số điện thoại sai -> 400", (await pub("POST", "/api/orders", { ...baseOrder, phone: "123" })).status === 400);
        check("Họ tên quá ngắn -> 400", (await pub("POST", "/api/orders", { ...baseOrder, customerName: "A" })).status === 400);
        check("Địa chỉ nhập dở (quá ngắn) -> 400", (await pub("POST", "/api/orders", { ...baseOrder, address: "abc" })).status === 400);
        check("Mức cọc 20% không hợp lệ -> 400", (await pub("POST", "/api/orders", { ...baseOrder, deposit_tier: 20 })).status === 400);
        const lowTier = await pub("POST", "/api/orders", { ...baseOrder, deposit_tier: 30 });
        check("Cọc 30% thấp hơn mức tối thiểu của sản phẩm -> 400", lowTier.status === 400, lowTier.data);
        check("Đặt quá số slot (6 > 5) -> 400", (await pub("POST", "/api/orders", { ...baseOrder, cart: [{ id: pid, quantity: 6 }] })).status === 400);
        check("Sản phẩm không tồn tại -> 400", (await pub("POST", "/api/orders", { ...baseOrder, cart: [{ id: 999999, quantity: 1 }] })).status === 400);
        const slotsNow = async () => (await pub("GET", `/api/products/${pid}`)).data.remaining_slots;
        check("Các lần đặt lỗi không làm mất slot", (await slotsNow()) === 5);

        // ---------- 4. Đặt cọc thành công ----------
        section("4. Đặt cọc thành công");
        const orderA = await pub("POST", "/api/orders", { ...baseOrder, cart: [{ id: pid, quantity: 2 }] });
        check("Đơn A (cọc 50%, 2 slot) -> 201", orderA.status === 201, orderA.data);
        const a = orderA.data.orders[0];
        created.orders.push(a);
        check("Tiền cọc = 100.000, đợt 2 = 100.000", a.deposit_amount === 100000 && a.second_payment_amount === 100000, a);
        check("Trạng thái ban đầu Pending_Deposit, chưa có địa chỉ", a.order_status === "Pending_Deposit" && a.shipping_address === "");
        check("Slot còn 3", (await slotsNow()) === 3);

        const orderB = await pub("POST", "/api/orders", { ...baseOrder, deposit_tier: 100, address: ADDRESS, cart: [{ id: pid, quantity: 1 }] });
        check("Đơn B (thanh toán 100%, có địa chỉ) -> 201", orderB.status === 201, orderB.data);
        const b = orderB.data.orders[0];
        created.orders.push(b);
        check("Đơn B: đợt 2 = 0, giữ địa chỉ", b.second_payment_amount === 0 && b.shipping_address === ADDRESS);
        check("Slot còn 2", (await slotsNow()) === 2);

        // ---------- 5. Khách tra cứu ----------
        section("5. Khách tra cứu và bổ sung địa chỉ");
        check("Sai mã đơn -> 404", (await pub("POST", "/api/orders/lookup", { phone: PHONE, code: "ZZZZZZ" })).status === 404);
        check("Đúng mã nhưng sai SĐT -> 404", (await pub("POST", "/api/orders/lookup", { phone: "0999999999", code: code(a) })).status === 404);
        const look = await pub("POST", "/api/orders/lookup", { phone: PHONE, code: "#" + code(a) });
        check("Tra cứu đúng SĐT + mã đơn -> 200", look.status === 200 && look.data.code === code(a), look.data);
        check("Kết quả không lộ _id / user_id", look.data._id === undefined && look.data.user_id === undefined);
        check("Đơn đang cho sửa địa chỉ", look.data.can_edit_address === true);
        check("Địa chỉ quá ngắn -> 400", (await pub("POST", "/api/orders/address", { phone: PHONE, code: code(a), shipping_address: "abc" })).status === 400);
        const setAddr = await pub("POST", "/api/orders/address", { phone: PHONE, code: code(a), shipping_address: ADDRESS });
        check("Khách bổ sung địa chỉ -> 200", setAddr.status === 200 && setAddr.data.shipping_address === ADDRESS, setAddr.data);

        // ---------- 6. Hết slot và hoàn slot ----------
        section("6. Hết slot, đóng PO, hoàn slot");
        const orderC = await pub("POST", "/api/orders", { ...baseOrder, deposit_tier: 100, cart: [{ id: pid, quantity: 2 }] });
        check("Đơn C lấy nốt 2 slot -> 201", orderC.status === 201, orderC.data);
        const c = orderC.data.orders[0];
        created.orders.push(c);
        const closed = await pub("GET", `/api/products/${pid}`);
        check("Hết slot -> po_status tự thành Closed", closed.data.remaining_slots === 0 && closed.data.po_status === "Closed", closed.data);
        const tooLate = await pub("POST", "/api/orders", { ...baseOrder, cart: [{ id: pid, quantity: 1 }] });
        check("Đặt thêm khi đã đóng cọc -> 400", tooLate.status === 400, tooLate.data);
        const forfeitC = await admin("PATCH", `/api/orders/${c._id}/status`, { order_status: "Forfeited" });
        check("Hủy đơn chưa cọc (Forfeited) -> 200", forfeitC.status === 200, forfeitC.data);
        check("Slot được hoàn lại (còn 2) và PO mở lại", (await slotsNow()) === 2 && (await pub("GET", `/api/products/${pid}`)).data.po_status !== "Closed");
        check("Đơn đã Forfeited không đổi được nữa -> 400", (await admin("PATCH", `/api/orders/${c._id}/status`, { order_status: "Deposited" })).status === 400);

        // ---------- 7. Admin duyệt đơn ----------
        section("7. Admin duyệt đơn");
        const filtered = await admin("GET", `/api/orders?product_id=${pid}`);
        check("Lọc đơn theo product_id có đủ 3 đơn", filtered.status === 200 && filtered.data.length === 3, filtered.data.length);
        check("order_status sai -> 400", (await admin("PATCH", `/api/orders/${a._id}/status`, { order_status: "Xyz" })).status === 400);
        check("PATCH không có nội dung -> 400", (await admin("PATCH", `/api/orders/${a._id}/status`, {})).status === 400);
        check("Mã đơn sai định dạng -> 400", (await admin("PATCH", "/api/orders/abc/status", { order_status: "Deposited" })).status === 400);
        check("Đơn A -> Deposited", (await admin("PATCH", `/api/orders/${a._id}/status`, { order_status: "Deposited" })).data.order_status === "Deposited");
        check("Đơn B -> Deposited", (await admin("PATCH", `/api/orders/${b._id}/status`, { order_status: "Deposited" })).data.order_status === "Deposited");

        // ---------- 8. Lô hàng ----------
        section("8. Lô hàng");
        const tracking = `TEST-${stamp}`;
        check("Tạo lô không có khóa -> 401", (await pub("POST", "/api/shipments", { tracking_code: tracking, associated_orders: [a._id] })).status === 401);
        check("Đơn đã Forfeited không vào lô được -> 400", (await admin("POST", "/api/shipments", { tracking_code: tracking, associated_orders: [c._id] })).status === 400);
        check("Mã đơn sai định dạng -> 400", (await admin("POST", "/api/shipments", { tracking_code: tracking, associated_orders: ["abc"] })).status === 400);
        const batch = await admin("POST", "/api/shipments", { tracking_code: tracking, associated_orders: [a._id, b._id] });
        check("Tạo lô gồm đơn A và B -> 201", batch.status === 201 && batch.data.batch_status === "In_Transit", batch.data);
        created.batch = batch.data;
        check("Đưa lại đơn đã có lô vào lô khác -> 409", (await admin("POST", "/api/shipments", { tracking_code: tracking + "-2", associated_orders: [a._id] })).status === 409);
        check("GET /api/shipments có lô vừa tạo", (await admin("GET", "/api/shipments")).data.some((x) => x.batch_id === batch.data.batch_id));
        check("batch_status sai -> 400", (await admin("PATCH", `/api/shipments/${batch.data.batch_id}/status`, { batch_status: "Xyz" })).status === 400);

        const arrive = await admin("PATCH", `/api/shipments/${batch.data.batch_id}/status`, { batch_status: "Arrived_VN_Warehouse" });
        check("Lô về kho VN -> 200, 2 đơn được chuyển trạng thái", arrive.status === 200 && arrive.data.orders_moved_to_waiting_for_address === 2, arrive.data);
        const afterArrive = (await admin("GET", `/api/orders?product_id=${pid}`)).data;
        check("Đơn A và B thành Waiting_For_Address", ["Waiting_For_Address"].every((s) => afterArrive.filter((o) => o._id === a._id || o._id === b._id).every((o) => o.order_status === s)));
        check("Lô đã về không quay lại In_Transit -> 400", (await admin("PATCH", `/api/shipments/${batch.data.batch_id}/status`, { batch_status: "In_Transit" })).status === 400);

        // ---------- 9. Giao hàng ----------
        section("9. Hoàn tất đơn");
        const lookAfter = await pub("POST", "/api/orders/lookup", { phone: PHONE, code: code(a) });
        check("Khách thấy đơn đã chuyển sang Waiting_For_Address", lookAfter.data.order_status === "Waiting_For_Address", lookAfter.data);
        check("Đơn A -> Ready_To_Ship (đã có địa chỉ)", (await admin("PATCH", `/api/orders/${a._id}/status`, { order_status: "Ready_To_Ship" })).data.order_status === "Ready_To_Ship");
        check("Đơn A -> Completed", (await admin("PATCH", `/api/orders/${a._id}/status`, { order_status: "Completed" })).data.order_status === "Completed");
        check("Đơn Completed không đổi lại được -> 400", (await admin("PATCH", `/api/orders/${a._id}/status`, { order_status: "Waiting_For_Address" })).status === 400);
        check("Đơn Completed khách không sửa địa chỉ nữa -> 400", (await pub("POST", "/api/orders/address", { phone: PHONE, code: code(a), shipping_address: ADDRESS + " mới" })).status === 400);

        // ---------- 10. Sửa sản phẩm ----------
        section("10. Sửa sản phẩm");
        check("remaining_slots vượt total_slots -> 400", (await admin("PUT", `/api/products/${pid}`, { remaining_slots: 99 })).status === 400);
        check("PUT không có trường nào -> 400", (await admin("PUT", `/api/products/${pid}`, {})).status === 400);
        const forced = await admin("PUT", `/api/products/${pid}`, { po_status: "Closed" });
        check("Admin ép Closed -> 200", forced.status === 200 && forced.data.po_status === "Closed", forced.data);
        check("Đóng cọc thủ công thì không đặt được -> 400", (await pub("POST", "/api/orders", { ...baseOrder, cart: [{ id: pid, quantity: 1 }] })).status === 400);
        const reopened = await admin("PUT", `/api/products/${pid}`, { po_status: "Open" });
        check("Mở lại -> Open", reopened.data.po_status === "Open", reopened.data);
        check("PUT sản phẩm không tồn tại -> 404", (await admin("PUT", "/api/products/999999", { name: "xx" })).status === 404);
    } catch (error) {
        failed++;
        console.log(`\n\x1b[31mLỗi bất ngờ khi chạy: ${error.message}\x1b[0m`);
    } finally {
        // ---------- Dọn dữ liệu test ----------
        section("Dọn dữ liệu test");
        if (created.batch) {
            const r = await admin("DELETE", `/api/shipments/${created.batch.batch_id}`);
            check("Xóa lô hàng test", r.status === 200, r.data);
        }
        for (const order of created.orders) {
            await admin("DELETE", `/api/orders/${order._id}`);
        }
        if (created.orders.length) check(`Xóa ${created.orders.length} đơn test`, true);
        if (created.product) {
            const r = await admin("DELETE", `/api/products/${created.product.id}`);
            check("Xóa sản phẩm test", r.status === 200, r.data);
        }
    }

    console.log(`\n\x1b[1mKết quả: ${passed} đạt, ${failed} lỗi\x1b[0m`);
    process.exit(failed ? 1 : 0);
}

main();