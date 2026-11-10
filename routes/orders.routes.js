// ============================================================
// routes/orders.routes.js
// VAI TRÒ: API đơn ĐẶT CỌC pre-order.
//   POST   /api/orders               -> khách đặt cọc (ai cũng dùng được)
//   POST   /api/orders/lookup        -> khách tra cứu đơn bằng SĐT + mã đơn
//   POST   /api/orders/address       -> khách bổ sung địa chỉ giao hàng

//   GET    /api/orders               -> xem đơn (CHỈ admin), lọc ?order_status=&product_id=
//   PATCH  /api/orders/:id/status    -> đổi trạng thái / bổ sung địa chỉ (CHỈ admin)
//   DELETE /api/orders/:id           -> xóa 1 đơn (CHỈ admin)
//
// Luồng trạng thái:
//   Pending_Deposit -> Deposited -> Waiting_For_Address -> Ready_To_Ship -> Completed
//   (Deposited -> Waiting_For_Address được tự động khi lô hàng về kho, xem shipments.routes.js)
//   Forfeited = khách bỏ đơn, xả cọc.
// ============================================================

// Import Express để tạo router
const express = require("express");
// Import model Order để thao tác collection đơn cọc
const Order = require("../models/Order");
// Import model Product để kiểm tra/trừ/hoàn slot
const Product = require("../models/Product");
// Middleware kiểm tra quyền admin cho các route quản trị
const requireAdmin = require("../middleware/requireAdmin");

// Tạo router Express
const router = express.Router();

// Lấy danh sách trạng thái đơn và các mức cọc (%) từ model Order
const { ORDER_STATUSES, DEPOSIT_TIERS } = Order;
// Các trạng thái "cuối" - đơn đã kết thúc, không cho đổi trạng thái nữa
const FINAL_STATUSES = ["Completed", "Forfeited"]; // đã kết thúc, không đổi nữa

// Helper format số tiền theo định dạng Việt Nam, ví dụ 1500000 -> "1.500.000 đ"
const vnd = (n) => Number(n).toLocaleString("vi-VN") + " đ";

// Trả slot về lại cho mô hình (khi đặt đơn lỗi giữa chừng, hoặc đơn chưa cọc bị hủy)
// - deducted: mảng [{ id, quantity }] các slot đã bị trừ trước đó
// - Dùng $inc để cộng lại số lượng slot (nguyên tử, an toàn khi có request đồng thời)
async function restoreSlots(deducted) {
    for (const { id, quantity } of deducted) {
        await Product.updateOne({ id }, { $inc: { remaining_slots: quantity } });
    }
}

// ---------- POST /api/orders ----------
// Khách gửi: customerName, phone, address (tùy chọn), note, deposit_tier (30|50|100),
//            cart = [{ id, quantity }]. TÊN, GIÁ, SLOT do server tự lấy từ MongoDB.
// Mỗi mô hình trong giỏ -> 1 đơn cọc riêng.
router.post("/", async (req, res) => {
    // Mảng lưu các slot đã trừ thành công - dùng để hoàn lại nếu có lỗi giữa chừng
    const deducted = [];

    try {
        // Lấy dữ liệu từ body
        const { customerName, phone, address, note, cart } = req.body || {};
        // Mức cọc: mặc định 30% nếu client không gửi
        const tier = Number(req.body && req.body.deposit_tier !== undefined ? req.body.deposit_tier : 30);

        // --- 1. Kiểm tra thông tin khách ---
        // Tên phải có ít nhất 3 ký tự
        if (!customerName || customerName.trim().length < 3) {
            return res.status(400).json({ error: "Họ tên phải có ít nhất 3 ký tự." });
        }
        // Số điện thoại phải đúng 10 chữ số
        if (!phone || !/^[0-9]{10}$/.test(phone.trim())) {
            return res.status(400).json({ error: "Số điện thoại phải gồm đúng 10 chữ số." });
        }
        // Địa chỉ KHÔNG bắt buộc lúc đặt cọc (sẽ xác nhận khi hàng về), nhưng đã nhập thì phải đủ chi tiết
        const cleanAddress = address ? String(address).trim() : "";
        if (cleanAddress && cleanAddress.length < 10) {
            return res.status(400).json({ error: "Địa chỉ nhận hàng phải có ít nhất 10 ký tự chi tiết (hoặc để trống, bổ sung sau)." });
        }
        // Mức cọc phải nằm trong danh sách cho phép (30/50/100)
        if (!DEPOSIT_TIERS.includes(tier)) {
            return res.status(400).json({ error: `Mức cọc không hợp lệ. Chọn một trong: ${DEPOSIT_TIERS.join("%, ")}%.` });
        }
        // Giỏ hàng phải là mảng không rỗng
        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: "Giỏ hàng đang trống." });
        }

        // --- 2. Gộp các dòng trùng id, kiểm tra id/số lượng hợp lệ ---
        // Dùng Map để gộp: nếu cùng 1 id xuất hiện nhiều dòng thì cộng dồn quantity
        const wanted = new Map();
        for (const line of cart) {
            const id = Number(line && line.id);
            const quantity = Number(line && line.quantity);
            // id và quantity phải là số nguyên; quantity từ 1 đến 99
            if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                return res.status(400).json({ error: "Dữ liệu giỏ hàng không hợp lệ." });
            }
            wanted.set(id, (wanted.get(id) || 0) + quantity);
        }

        // --- 3. Lấy mô hình THẬT từ MongoDB ---
        // Danh sách id cần lấy
        const ids = [...wanted.keys()];
        // Query một lần với $in để tránh N+1
        const products = await Product.find({ id: { $in: ids } });
        // Nếu số sản phẩm tìm được ít hơn số id yêu cầu -> có id không tồn tại
        if (products.length !== ids.length) {
            return res.status(400).json({ error: "Có sản phẩm trong giỏ không còn tồn tại." });
        }

        // --- 4. Kiểm tra PO còn mở, còn slot, và mức cọc đủ tối thiểu ---
        for (const product of products) {
            const quantity = wanted.get(product.id);

            // resolvePoStatus tính trạng thái THỰC TẾ (kết hợp po_status + cut_off_date + slot)
            if (Product.resolvePoStatus(product) === "Closed") {
                return res.status(400).json({ error: `"${product.name}" đã đóng cọc hoặc hết slot.` });
            }
            // Không đủ slot
            if (product.remaining_slots < quantity) {
                return res.status(400).json({ error: `"${product.name}" chỉ còn ${product.remaining_slots} slot.` });
            }
            // Tính số tiền cọc theo % đã chọn
            const deposit = Math.round((product.total_price * quantity * tier) / 100);
            // Mức cọc tối thiểu của sản phẩm (do admin đặt)
            const minDeposit = product.deposit_price * quantity;
            // Nếu cọc theo % thấp hơn mức tối thiểu -> yêu cầu chọn mức cao hơn
            if (deposit < minDeposit) {
                return res.status(400).json({
                    error: `"${product.name}" yêu cầu cọc tối thiểu ${vnd(minDeposit)} (bạn chọn cọc ${tier}% = ${vnd(deposit)}). Hãy chọn mức cọc cao hơn.`,
                });
            }
        }

        // --- 5. Trừ slot (điều kiện chống âm slot và đặt đúng lúc PO vừa đóng) ---
        for (const product of products) {
            const quantity = wanted.get(product.id);
            // Update có điều kiện: chỉ trừ nếu vẫn còn đủ slot, PO chưa đóng, và chưa quá hạn cọc
            // -> tránh race condition (2 khách cùng đặt slot cuối)
            const result = await Product.updateOne(
                {
                    id: product.id,
                    remaining_slots: { $gte: quantity },     // còn đủ slot
                    po_status: { $ne: "Closed" },            // PO chưa bị đóng thủ công
                    cut_off_date: { $gt: new Date() },       // chưa quá hạn cọc
                },
                { $inc: { remaining_slots: -quantity } }     // trừ slot
            );
            // modifiedCount === 0 nghĩa là điều kiện không thỏa -> ai đó vừa đặt/đóng trước
            if (result.modifiedCount === 0) {
                await restoreSlots(deducted); // hoàn lại các slot đã trừ trước đó
                return res.status(409).json({
                    error: `"${product.name}" vừa hết slot hoặc đóng cọc, vui lòng kiểm tra lại giỏ hàng.`,
                });
            }
            // Ghi nhận đã trừ slot để có thể hoàn nếu lỗi sau đó
            deducted.push({ id: product.id, quantity });
        }

        // --- 6. Tạo mỗi mô hình 1 đơn cọc (giá thật từ database) ---
        const docs = products.map((product) => {
            const quantity = wanted.get(product.id);
            const total = product.total_price * quantity;
            const deposit_amount = Math.round((total * tier) / 100);
            return {
                user_id: phone.trim(),                 // dùng SĐT làm user_id (khách không có tài khoản)
                customer_name: customerName.trim(),
                phone_number: phone.trim(),
                shipping_address: cleanAddress,
                note: note ? String(note).trim() : "",
                product_id: product.id,
                product_name: product.name,            // snapshot tên tại thời điểm đặt
                unit_price: product.total_price,       // snapshot giá tại thời điểm đặt
                quantity,
                image: product.image,
                deposit_tier: tier,
                deposit_amount,                        // số tiền cọc phải trả
                second_payment_amount: total - deposit_amount, // số tiền còn lại
            };
        });
        // insertMany: tạo tất cả đơn trong 1 lần (hiệu quả hơn nhiều insert đơn lẻ)
        const orders = await Order.insertMany(docs);

        // Trả về danh sách đơn + tổng kết tiền
        res.status(201).json({
            orders,
            total_price: orders.reduce((sum, o) => sum + o.unit_price * o.quantity, 0),
            deposit_amount: orders.reduce((sum, o) => sum + o.deposit_amount, 0),
            second_payment_amount: orders.reduce((sum, o) => sum + o.second_payment_amount, 0),
        });
    } catch (error) {
        console.error("Lỗi khi tạo đơn đặt cọc:", error);
        try {
            // Nếu lỗi xảy ra sau khi đã trừ slot -> hoàn lại
            await restoreSlots(deducted);
        } catch (restoreError) {
            console.error("Lỗi khi hoàn slot:", restoreError);
        }
        res.status(500).json({ error: "Lỗi server khi tạo đơn đặt cọc" });
    }
});

// ---------- Khách tự tra cứu đơn ----------
// Khách chưa có tài khoản, nên xác thực bằng SỐ ĐIỆN THOẠI + MÃ ĐƠN (6 ký tự cuối của _id,
// chính là mã "#XXXXXX" hiện sau khi đặt cọc). Thiếu 1 trong 2 -> không thấy gì.
// Các trạng thái mà khách còn được phép sửa địa chỉ giao hàng
const ADDRESS_EDITABLE = ["Pending_Deposit", "Deposited", "Waiting_For_Address"];

// Sinh mã đơn hiển thị cho khách: 6 ký tự cuối của _id, in hoa
// (ví dụ _id = "...a1b2c3" -> code = "A1B2C3")
function orderCode(order) {
    return String(order._id).slice(-6).toUpperCase();
}

// Tìm đơn của khách dựa vào SĐT + mã đơn
// - cleanPhone: 10 chữ số
// - cleanCode: 6 ký tự hex (0-9, A-F), bỏ dấu # nếu có
// Trả về order nếu tìm thấy, null nếu không
async function findCustomerOrder(phone, code) {
    const cleanPhone = String(phone || "").trim();
    const cleanCode = String(code || "").trim().toUpperCase().replace(/^#/, "");
    // Validate định dạng trước khi query để tránh query rác
    if (!/^[0-9]{10}$/.test(cleanPhone) || !/^[0-9A-F]{6}$/.test(cleanCode)) return null;
    const orders = await Order.find({ phone_number: cleanPhone });
    // Tìm trong danh sách đơn của SĐT đó đơn có mã trùng khớp
    return orders.find((order) => orderCode(order) === cleanCode) || null;
}

// Chỉ trả các trường khách cần xem, không lộ thông tin nội bộ
// (ví dụ: không trả _id thật, user_id, các trường admin-only...)
function toPublicOrder(order) {
    return {
        code: orderCode(order),
        product_name: order.product_name,
        quantity: order.quantity,
        image: order.image,
        deposit_tier: order.deposit_tier,
        deposit_amount: order.deposit_amount,
        second_payment_amount: order.second_payment_amount,
        order_status: order.order_status,
        shipping_address: order.shipping_address,
        // Cờ cho frontend biết đơn này còn được sửa địa chỉ hay không
        can_edit_address: ADDRESS_EDITABLE.includes(order.order_status),
        created_at: order.created_at,
    };
}

// POST /api/orders/lookup   body: { phone, code }
router.post("/lookup", async (req, res) => {
    try {
        // Tìm đơn theo SĐT + mã đơn
        const order = await findCustomerOrder(req.body && req.body.phone, req.body && req.body.code);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn. Kiểm tra lại số điện thoại và mã đơn." });
        }
        // Trả về dạng rút gọn cho khách
        res.json(toPublicOrder(order));
    } catch (error) {
        console.error("Lỗi khi tra cứu đơn:", error);
        res.status(500).json({ error: "Lỗi server khi tra cứu đơn" });
    }
});

// POST /api/orders/address   body: { phone, code, shipping_address }
// Khách bổ sung/sửa địa chỉ giao hàng (khi hàng về kho hoặc trước đó).
router.post("/address", async (req, res) => {
    try {
        const { phone, code, shipping_address } = req.body || {};
        // Trim địa chỉ
        const address = String(shipping_address || "").trim();
        // Địa chỉ phải đủ chi tiết (>=10 ký tự)
        if (address.length < 10) {
            return res.status(400).json({ error: "Địa chỉ phải có ít nhất 10 ký tự chi tiết." });
        }
        // Xác thực đơn thuộc về khách qua SĐT + mã đơn
        const order = await findCustomerOrder(phone, code);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn. Kiểm tra lại số điện thoại và mã đơn." });
        }
        // Chỉ cho sửa địa chỉ khi đơn còn ở trạng thái cho phép
        if (!ADDRESS_EDITABLE.includes(order.order_status)) {
            return res.status(400).json({ error: "Đơn này không còn sửa địa chỉ được, vui lòng liên hệ shop." });
        }
        order.shipping_address = address;
        await order.save(); // lưu thay đổi (chạy validate schema)
        res.json(toPublicOrder(order));
    } catch (error) {
        console.error("Lỗi khi cập nhật địa chỉ:", error);
        res.status(500).json({ error: "Lỗi server khi cập nhật địa chỉ" });
    }
});

// ---------- GET /api/orders (chỉ admin) ----------
router.get("/", requireAdmin, async (req, res) => {
    try {
        const filter = {};
        // Lọc theo trạng thái đơn nếu có truyền
        if (req.query.order_status) {
            if (!ORDER_STATUSES.includes(req.query.order_status)) {
                return res.status(400).json({ error: `order_status không hợp lệ. Chọn: ${ORDER_STATUSES.join(", ")}` });
            }
            filter.order_status = req.query.order_status;
        }
        // Lọc theo product_id nếu có truyền (ép về số và validate)
        if (req.query.product_id !== undefined) {
            const productId = Number(req.query.product_id);
            if (!Number.isInteger(productId)) {
                return res.status(400).json({ error: "product_id không hợp lệ" });
            }
            filter.product_id = productId;
        }
        // Sắp xếp đơn mới nhất lên đầu
        const orders = await Order.find(filter).sort({ created_at: -1 });
        res.json(orders);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách đơn cọc:", error);
        res.status(500).json({ error: "Lỗi server khi lấy danh sách đơn cọc" });
    }
});

// ---------- PATCH /api/orders/:id/status (chỉ admin) ----------
// Body (gửi 1 hoặc cả 2): { "order_status": "Deposited", "shipping_address": "Số nhà, đường, quận..." }
// - Đơn đã Completed/Forfeited thì không đổi trạng thái nữa.
// - Ready_To_Ship yêu cầu đơn đã có địa chỉ giao hàng.
// - Forfeited khi đơn CHƯA cọc (Pending_Deposit): hoàn slot lại cho mô hình.
//   Forfeited khi đã cọc: xả cọc, KHÔNG hoàn slot tự động (shop tự quyết định bán lại).
router.patch("/:id/status", requireAdmin, async (req, res) => {
    try {
        const { order_status, shipping_address } = req.body || {};

        // Phải gửi ít nhất 1 trong 2 trường
        if (order_status === undefined && shipping_address === undefined) {
            return res.status(400).json({ error: "Cần gửi order_status và/hoặc shipping_address." });
        }
        // Validate trạng thái nếu có gửi
        if (order_status !== undefined && !ORDER_STATUSES.includes(order_status)) {
            return res.status(400).json({ error: `Trạng thái không hợp lệ. Chọn một trong: ${ORDER_STATUSES.join(", ")}` });
        }
        // Validate địa chỉ nếu có gửi
        let address;
        if (shipping_address !== undefined) {
            address = String(shipping_address).trim();
            if (address.length < 10) {
                return res.status(400).json({ error: "Địa chỉ giao hàng phải có ít nhất 10 ký tự chi tiết." });
            }
        }

        // Tìm đơn theo _id (Mongo ObjectId)
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
        }

        // Chỉ coi là "đang đổi trạng thái" nếu giá trị mới khác giá trị hiện tại
        const changing = order_status !== undefined && order_status !== order.order_status;

        // Đơn đã kết thúc (Completed/Forfeited) -> không cho đổi nữa
        if (changing && FINAL_STATUSES.includes(order.order_status)) {
            return res.status(400).json({ error: `Đơn đã ở trạng thái cuối (${order.order_status}), không thể đổi.` });
        }
        // Cập nhật địa chỉ nếu có
        if (address !== undefined) order.shipping_address = address;

        if (changing) {
            // Muốn chuyển sang Ready_To_Ship mà chưa có địa chỉ -> chặn
            if (order_status === "Ready_To_Ship" && !order.shipping_address) {
                return res.status(400).json({ error: "Đơn chưa có địa chỉ giao hàng, hãy gửi kèm shipping_address." });
            }
            // Forfeited đơn chưa cọc -> hoàn slot lại cho sản phẩm
            // (đơn đã cọc thì không hoàn slot vì shop tự quyết định bán lại)
            if (order_status === "Forfeited" && order.order_status === "Pending_Deposit") {
                await restoreSlots([{ id: order.product_id, quantity: order.quantity }]);
            }
            order.order_status = order_status;
        }

        await order.save();
        res.json(order);
    } catch (error) {
        // _id sai định dạng (không phải 24 ký tự hex) cũng nhảy vào đây
        console.error("Lỗi khi cập nhật đơn cọc:", error);
        res.status(400).json({ error: "Mã đơn hàng không hợp lệ" });
    }
});

// ---------- DELETE /api/orders/:id (chỉ admin) ----------
// Lưu ý: xóa đơn KHÔNG hoàn slot. Muốn hoàn slot cho đơn chưa cọc, dùng PATCH order_status = "Forfeited".
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        // Xóa đơn theo _id, trả về document đã xóa (hoặc null)
        const deleted = await Order.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
        }
        res.json({ message: "Đã xóa đơn hàng" });
    } catch (error) {
        console.error("Lỗi khi xóa đơn cọc:", error);
        res.status(400).json({ error: "Mã đơn hàng không hợp lệ" });
    }
});

module.exports = router;