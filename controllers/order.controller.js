// ============================================================
// controllers/order.controller.js
// VAI TRÒ: Điều khiển quy trình Đặt cọc, Tra cứu và Xử lý Đơn Pre-order
// ============================================================

const Order = require("../models/Order");
const Product = require("../models/Product");

const { ORDER_STATUSES, DEPOSIT_TIERS } = Order;
const FINAL_STATUSES = ["Completed", "Forfeited"];
const ADDRESS_EDITABLE = ["Pending_Deposit", "Deposited", "Waiting_For_Address"];

const vnd = (n) => Number(n).toLocaleString("vi-VN") + " đ";

// Trả slot về lại cho mô hình (khi đặt đơn lỗi giữa chừng, hoặc đơn chưa cọc bị hủy)
async function restoreSlots(deducted) {
    for (const { id, quantity } of deducted) {
        await Product.updateOne({ id }, { $inc: { remaining_slots: quantity } });
    }
}

function orderCode(order) {
    return String(order._id).slice(-6).toUpperCase();
}

async function findCustomerOrder(phone, code) {
    const cleanPhone = String(phone || "").trim();
    const cleanCode = String(code || "").trim().toUpperCase().replace(/^#/, "");
    if (!/^[0-9]{10}$/.test(cleanPhone) || !/^[0-9A-F]{6}$/.test(cleanCode)) return null;
    const orders = await Order.find({ phone_number: cleanPhone });
    return orders.find((order) => orderCode(order) === cleanCode) || null;
}

function toPublicOrder(order) {
    return {
        _id: order._id,
        code: orderCode(order),
        product_name: order.product_name,
        quantity: order.quantity,
        image: order.image,
        deposit_tier: order.deposit_tier,
        deposit_amount: order.deposit_amount,
        second_payment_amount: order.second_payment_amount,
        order_status: order.order_status,
        shipping_address: order.shipping_address,
        can_edit_address: ADDRESS_EDITABLE.includes(order.order_status),
        created_at: order.created_at,
    };
}

// POST /api/orders (Khách đặt cọc - cho phép cả khách vãng lai và user đăng nhập)
exports.createOrder = async (req, res) => {
    const deducted = [];

    try {
        const { customerName, phone, address, note, cart } = req.body || {};
        const tier = Number(req.body && req.body.deposit_tier !== undefined ? req.body.deposit_tier : 30);

        // Lấy thông tin từ user đăng nhập nếu có
        const finalName = customerName || (req.user && req.user.name) || "";
        const finalPhone = phone || (req.user && req.user.phone) || "";

        // --- 1. Kiểm tra thông tin khách ---
        if (!finalName || finalName.trim().length < 3) {
            return res.status(400).json({ error: "Họ tên phải có ít nhất 3 ký tự." });
        }
        if (!finalPhone || !/^[0-9]{10}$/.test(finalPhone.trim())) {
            return res.status(400).json({ error: "Số điện thoại phải gồm đúng 10 chữ số." });
        }

        const cleanAddress = address ? String(address).trim() : (req.user && req.user.address ? req.user.address : "");
        if (cleanAddress && cleanAddress.length < 10) {
            return res.status(400).json({ error: "Địa chỉ nhận hàng phải có ít nhất 10 ký tự chi tiết (hoặc để trống, bổ sung sau)." });
        }
        if (!DEPOSIT_TIERS.includes(tier)) {
            return res.status(400).json({ error: `Mức cọc không hợp lệ. Chọn một trong: ${DEPOSIT_TIERS.join("%, ")}%.` });
        }
        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: "Giỏ hàng đang trống." });
        }

        // --- 2. Gộp các dòng trùng id ---
        const wanted = new Map();
        for (const line of cart) {
            const id = Number(line && line.id);
            const quantity = Number(line && line.quantity);
            if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                return res.status(400).json({ error: "Dữ liệu giỏ hàng không hợp lệ." });
            }
            wanted.set(id, (wanted.get(id) || 0) + quantity);
        }

        // --- 3. Lấy sản phẩm từ database ---
        const ids = [...wanted.keys()];
        const products = await Product.find({ id: { $in: ids } });
        if (products.length !== ids.length) {
            return res.status(400).json({ error: "Có sản phẩm trong giỏ không còn tồn tại." });
        }

        // --- 4. Kiểm tra slot và giá cọc ---
        for (const product of products) {
            const quantity = wanted.get(product.id);

            if (Product.resolvePoStatus(product) === "Closed") {
                return res.status(400).json({ error: `"${product.name}" đã đóng cọc hoặc hết slot.` });
            }
            if (product.remaining_slots < quantity) {
                return res.status(400).json({ error: `"${product.name}" chỉ còn ${product.remaining_slots} slot.` });
            }
            const deposit = Math.round((product.total_price * quantity * tier) / 100);
            const minDeposit = product.deposit_price * quantity;
            if (deposit < minDeposit) {
                return res.status(400).json({
                    error: `"${product.name}" yêu cầu cọc tối thiểu ${vnd(minDeposit)} (bạn chọn cọc ${tier}% = ${vnd(deposit)}). Hãy chọn mức cọc cao hơn.`,
                });
            }
        }

        // --- 5. Trừ slot an toàn ---
        for (const product of products) {
            const quantity = wanted.get(product.id);
            const result = await Product.updateOne(
                {
                    id: product.id,
                    remaining_slots: { $gte: quantity },
                    po_status: { $ne: "Closed" },
                    cut_off_date: { $gt: new Date() },
                },
                { $inc: { remaining_slots: -quantity } }
            );
            if (result.modifiedCount === 0) {
                await restoreSlots(deducted);
                return res.status(409).json({
                    error: `"${product.name}" vừa hết slot hoặc đóng cọc, vui lòng kiểm tra lại giỏ hàng.`,
                });
            }
            deducted.push({ id: product.id, quantity });
        }

        // --- 6. Tạo đơn cọc ---
        const userId = req.user && req.user.id ? String(req.user.id) : finalPhone.trim();

        const docs = products.map((product) => {
            const quantity = wanted.get(product.id);
            const total = product.total_price * quantity;
            const deposit_amount = Math.round((total * tier) / 100);
            return {
                user_id: userId,
                customer_name: finalName.trim(),
                phone_number: finalPhone.trim(),
                shipping_address: cleanAddress,
                note: note ? String(note).trim() : "",
                product_id: product.id,
                product_name: product.name,
                unit_price: product.total_price,
                quantity,
                image: product.image,
                deposit_tier: tier,
                deposit_amount,
                second_payment_amount: total - deposit_amount,
            };
        });
        const orders = await Order.insertMany(docs);

        res.status(201).json({
            orders,
            total_price: orders.reduce((sum, o) => sum + o.unit_price * o.quantity, 0),
            deposit_amount: orders.reduce((sum, o) => sum + o.deposit_amount, 0),
            second_payment_amount: orders.reduce((sum, o) => sum + o.second_payment_amount, 0),
        });
    } catch (error) {
        console.error("Lỗi khi tạo đơn đặt cọc:", error);
        try {
            await restoreSlots(deducted);
        } catch (restoreError) {
            console.error("Lỗi khi hoàn slot:", restoreError);
        }
        res.status(500).json({ error: "Lỗi server khi tạo đơn đặt cọc" });
    }
};

// POST /api/orders/lookup
exports.lookupOrder = async (req, res) => {
    try {
        const order = await findCustomerOrder(req.body && req.body.phone, req.body && req.body.code);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn. Kiểm tra lại số điện thoại và mã đơn." });
        }
        res.json(toPublicOrder(order));
    } catch (error) {
        console.error("Lỗi khi tra cứu đơn:", error);
        res.status(500).json({ error: "Lỗi server khi tra cứu đơn" });
    }
};

// GET /api/orders/my-orders (Dành cho User đã đăng nhập)
exports.getMyOrders = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: "Vui lòng đăng nhập." });
        }
        const orders = await Order.find({
            $or: [{ user_id: req.user.id }, { phone_number: req.user.phone }],
        }).sort({ created_at: -1 });

        res.json(orders.map(toPublicOrder));
    } catch (error) {
        console.error("Lỗi khi lấy danh sách đơn của tôi:", error);
        res.status(500).json({ error: "Lỗi server khi lấy danh sách đơn của bạn" });
    }
};

// POST /api/orders/address
exports.updateAddress = async (req, res) => {
    try {
        const { phone, code, shipping_address } = req.body || {};
        const address = String(shipping_address || "").trim();
        if (address.length < 10) {
            return res.status(400).json({ error: "Địa chỉ phải có ít nhất 10 ký tự chi tiết." });
        }
        const order = await findCustomerOrder(phone, code);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn. Kiểm tra lại số điện thoại và mã đơn." });
        }
        if (!ADDRESS_EDITABLE.includes(order.order_status)) {
            return res.status(400).json({ error: "Đơn này không còn sửa địa chỉ được, vui lòng liên hệ shop." });
        }
        order.shipping_address = address;
        await order.save();
        res.json(toPublicOrder(order));
    } catch (error) {
        console.error("Lỗi khi cập nhật địa chỉ:", error);
        res.status(500).json({ error: "Lỗi server khi cập nhật địa chỉ" });
    }
};

// GET /api/orders (chỉ admin)
exports.getAllOrders = async (req, res) => {
    try {
        const filter = {};
        if (req.query.order_status) {
            if (!ORDER_STATUSES.includes(req.query.order_status)) {
                return res.status(400).json({ error: `order_status không hợp lệ. Chọn: ${ORDER_STATUSES.join(", ")}` });
            }
            filter.order_status = req.query.order_status;
        }
        if (req.query.product_id !== undefined) {
            const productId = Number(req.query.product_id);
            if (!Number.isInteger(productId)) {
                return res.status(400).json({ error: "product_id không hợp lệ" });
            }
            filter.product_id = productId;
        }
        const orders = await Order.find(filter).sort({ created_at: -1 });
        res.json(orders);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách đơn cọc:", error);
        res.status(500).json({ error: "Lỗi server khi lấy danh sách đơn cọc" });
    }
};

// PATCH /api/orders/:id/status (chỉ admin)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { order_status, shipping_address } = req.body || {};

        if (order_status === undefined && shipping_address === undefined) {
            return res.status(400).json({ error: "Cần gửi order_status và/hoặc shipping_address." });
        }
        if (order_status !== undefined && !ORDER_STATUSES.includes(order_status)) {
            return res.status(400).json({ error: `Trạng thái không hợp lệ. Chọn một trong: ${ORDER_STATUSES.join(", ")}` });
        }
        let address;
        if (shipping_address !== undefined) {
            address = String(shipping_address).trim();
            if (address.length < 10) {
                return res.status(400).json({ error: "Địa chỉ giao hàng phải có ít nhất 10 ký tự chi tiết." });
            }
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
        }

        const changing = order_status !== undefined && order_status !== order.order_status;

        if (changing && FINAL_STATUSES.includes(order.order_status)) {
            return res.status(400).json({ error: `Đơn đã ở trạng thái cuối (${order.order_status}), không thể đổi.` });
        }
        if (address !== undefined) order.shipping_address = address;

        if (changing) {
            if (order_status === "Ready_To_Ship" && !order.shipping_address) {
                return res.status(400).json({ error: "Đơn chưa có địa chỉ giao hàng, hãy gửi kèm shipping_address." });
            }
            if (order_status === "Forfeited" && order.order_status === "Pending_Deposit") {
                await restoreSlots([{ id: order.product_id, quantity: order.quantity }]);
            }
            order.order_status = order_status;
        }

        await order.save();
        res.json(order);
    } catch (error) {
        console.error("Lỗi khi cập nhật đơn cọc:", error);
        res.status(400).json({ error: "Mã đơn hàng không hợp lệ" });
    }
};

// DELETE /api/orders/:id (chỉ admin)
exports.deleteOrder = async (req, res) => {
    try {
        const deleted = await Order.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
        }
        res.json({ message: "Đã xóa đơn hàng" });
    } catch (error) {
        console.error("Lỗi khi xóa đơn cọc:", error);
        res.status(400).json({ error: "Mã đơn hàng không hợp lệ" });
    }
};
