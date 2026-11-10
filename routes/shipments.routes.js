// ============================================================
// routes/shipments.routes.js
// VAI TRÒ: API lô hàng nhập (Shipment_Batch). TOÀN BỘ chỉ dành cho admin.
//   GET    /api/shipments              -> danh sách lô (kèm thông tin đơn trong lô)
//   POST   /api/shipments              -> tạo lô: { tracking_code, associated_orders: [<order _id>] }
//   PATCH  /api/shipments/:id/status   -> { batch_status: "Arrived_VN_Warehouse" }
//   DELETE /api/shipments/:id          -> xóa lô (KHÔNG đổi lại trạng thái các đơn trong lô)
// :id là batch_id (số).
//
// Khi lô chuyển sang Arrived_VN_Warehouse, mọi đơn trong lô đang "Deposited"
// tự động chuyển sang "Waiting_For_Address" (hàng đã về, chờ khách xác nhận địa chỉ
// và thanh toán đợt 2).
// ============================================================

// Import Express để tạo router
const express = require("express");
// Import mongoose để dùng mongoose.isValidObjectId() kiểm tra ObjectId hợp lệ
const mongoose = require("mongoose");
// Import model ShipmentBatch (lô hàng nhập)
const ShipmentBatch = require("../models/ShipmentBatch");
// Import model Order để truy vấn/cập nhật đơn hàng trong lô
const Order = require("../models/Order");
// Middleware kiểm tra quyền admin
const requireAdmin = require("../middleware/requireAdmin");

// Tạo router Express
const router = express.Router();
// Áp middleware requireAdmin cho TẤT CẢ route bên dưới
// (khác với orders.routes.js phải gắn riêng từng route, ở đây dùng router.use cho gọn)
router.use(requireAdmin); // mọi route bên dưới đều cần x-admin-key

// Helper parse và validate batch_id từ URL
// - Nếu hợp lệ: trả về số nguyên
// - Nếu không hợp lệ: tự gửi response 400 và trả null
// Nhờ vậy route gọi hàm này chỉ cần: if (batchId === null) return;
function parseBatchId(req, res) {
    const id = Number(req.params.id);
    // batch_id phải là số nguyên (nếu là "abc" -> NaN -> lỗi)
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Mã lô hàng không hợp lệ" });
        return null;
    }
    return id;
}

// ---------- GET /api/shipments ----------
// Lấy danh sách tất cả lô hàng, kèm thông tin tóm tắt các đơn trong lô
router.get("/", async (req, res) => {
    try {
        const batches = await ShipmentBatch.find()
            // Sắp xếp lô mới nhất lên đầu (batch_id giảm dần)
            .sort({ batch_id: -1 })
            // populate: thay mảng ObjectId "associated_orders" bằng document Order thật,
            // nhưng chỉ lấy các trường cần thiết (tránh trả về toàn bộ dữ liệu đơn)
            .populate("associated_orders", "customer_name product_name quantity order_status");
        res.json(batches);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi lấy danh sách lô hàng" });
    }
});

// ---------- POST /api/shipments ----------
// Tạo lô hàng mới: gắn các đơn "Deposited" vào lô, sinh batch_id tăng dần
router.post("/", async (req, res) => {
    try {
        // Lấy dữ liệu từ body
        const { tracking_code, associated_orders } = req.body || {};

        // Chuẩn hóa mã vận chuyển: ép về string, trim
        const code = typeof tracking_code === "string" ? tracking_code.trim() : "";
        // Mã vận chuyển quốc tế phải có ít nhất 5 ký tự
        if (code.length < 5) {
            return res.status(400).json({ error: "Mã vận chuyển quốc tế (tracking_code) phải có ít nhất 5 ký tự." });
        }
        // Phải là mảng không rỗng
        if (!Array.isArray(associated_orders) || associated_orders.length === 0) {
            return res.status(400).json({ error: "associated_orders phải là mảng mã đơn hàng, ít nhất 1 đơn." });
        }
        // Ép tất cả về string + loại trùng bằng Set (tránh cùng 1 đơn bị gửi 2 lần)
        const ids = [...new Set(associated_orders.map(String))];
        // Kiểm tra tất cả đều là ObjectId hợp lệ (24 ký tự hex)
        if (!ids.every((id) => mongoose.isValidObjectId(id))) {
            return res.status(400).json({ error: "Có mã đơn hàng sai định dạng." });
        }

        // Chỉ đơn đã nhận cọc (Deposited) mới được đưa vào lô
        // Truy vấn 1 lần bằng $in để tránh N+1
        const orders = await Order.find({ _id: { $in: ids } });
        // Nếu số đơn tìm được ít hơn số id yêu cầu -> có id không tồn tại
        if (orders.length !== ids.length) {
            return res.status(400).json({ error: "Có mã đơn hàng không tồn tại." });
        }
        // Tìm đơn đầu tiên KHÔNG phải "Deposited" -> báo lỗi kèm trạng thái hiện tại
        const notDeposited = orders.find((o) => o.order_status !== "Deposited");
        if (notDeposited) {
            return res.status(400).json({
                error: `Đơn ${notDeposited._id} đang ở trạng thái ${notDeposited.order_status}, chỉ đơn "Deposited" mới vào lô được.`,
            });
        }
        // Mỗi đơn chỉ thuộc 1 lô: kiểm tra xem có đơn nào đã nằm trong lô khác chưa
        const inBatch = await ShipmentBatch.findOne({ associated_orders: { $in: ids } });
        if (inBatch) {
            return res.status(409).json({ error: `Có đơn đã nằm trong lô #${inBatch.batch_id}.` });
        }

        // Sinh batch_id mới = batch_id lớn nhất hiện tại + 1 (hoặc 1 nếu chưa có lô nào)
        const last = await ShipmentBatch.findOne().sort({ batch_id: -1 });
        const batch = await ShipmentBatch.create({
            batch_id: last ? last.batch_id + 1 : 1,
            tracking_code: code,
            associated_orders: ids,
        });
        // Trả về 201 Created kèm lô vừa tạo
        res.status(201).json(batch);
    } catch (error) {
        // Lỗi trùng khóa unique (tracking_code hoặc batch_id) - ví dụ 2 request đồng thời
        if (error.code === 11000) {
            return res.status(409).json({ error: "Trùng mã vận chuyển hoặc mã lô, vui lòng kiểm tra lại." });
        }
        console.error("Lỗi khi tạo lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi tạo lô hàng" });
    }
});

// ---------- PATCH /api/shipments/:id/status ----------
// Đổi trạng thái lô hàng. Đặc biệt: khi chuyển sang Arrived_VN_Warehouse
// -> tự động chuyển các đơn "Deposited" trong lô sang "Waiting_For_Address"
router.patch("/:id/status", async (req, res) => {
    try {
        // Parse + validate batch_id; nếu sai thì hàm đã gửi response 400
        const batchId = parseBatchId(req, res);
        if (batchId === null) return;

        const { batch_status } = req.body || {};
        // Validate trạng thái mới phải nằm trong danh sách cho phép của model
        if (!ShipmentBatch.BATCH_STATUSES.includes(batch_status)) {
            return res.status(400).json({ error: `Trạng thái không hợp lệ. Chọn: ${ShipmentBatch.BATCH_STATUSES.join(", ")}` });
        }

        // Tìm lô theo batch_id
        const batch = await ShipmentBatch.findOne({ batch_id: batchId });
        if (!batch) {
            return res.status(404).json({ error: "Không tìm thấy lô hàng" });
        }
        // Chặn "quay lui": lô đã về kho VN thì không được chuyển ngược về In_Transit
        if (batch.batch_status === "Arrived_VN_Warehouse" && batch_status === "In_Transit") {
            return res.status(400).json({ error: "Lô đã về kho Việt Nam, không thể quay lại In_Transit." });
        }

        // Đếm số đơn được "đẩy" sang Waiting_For_Address (mặc định 0)
        let notified = 0;
        // Chỉ xử lý khi: trạng thái MỚI là Arrived_VN_Warehouse VÀ trạng thái CŨ khác nó
        // (tránh chạy lại updateMany vô ích nếu lô vốn đã ở trạng thái này)
        if (batch_status === "Arrived_VN_Warehouse" && batch.batch_status !== "Arrived_VN_Warehouse") {
            const result = await Order.updateMany(
                // Điều kiện: đơn thuộc lô này VÀ đang ở "Deposited"
                { _id: { $in: batch.associated_orders }, order_status: "Deposited" },
                // Chuyển sang chờ khách xác nhận địa chỉ + thanh toán đợt 2
                { $set: { order_status: "Waiting_For_Address" } }
            );
            // modifiedCount = số đơn thực sự bị đổi trạng thái
            notified = result.modifiedCount;
        }

        // Cập nhật trạng thái lô và lưu
        batch.batch_status = batch_status;
        await batch.save();
        // Trả về lô + số đơn đã được chuyển trạng thái (để admin biết có bao nhiêu đơn được "thông báo")
        res.json({ batch, orders_moved_to_waiting_for_address: notified });
    } catch (error) {
        console.error("Lỗi khi cập nhật lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi cập nhật lô hàng" });
    }
});

// ---------- DELETE /api/shipments/:id ----------
// Xóa lô hàng. LƯU Ý: KHÔNG đổi lại trạng thái các đơn trong lô
// (đơn đã chuyển sang Waiting_For_Address vẫn giữ nguyên trạng thái đó)
router.delete("/:id", async (req, res) => {
    try {
        // Parse + validate batch_id; nếu sai thì hàm đã gửi response 400
        const batchId = parseBatchId(req, res);
        if (batchId === null) return;

        // Tìm lô theo batch_id
        const batch = await ShipmentBatch.findOne({ batch_id: batchId });
        if (!batch) {
            return res.status(404).json({ error: "Không tìm thấy lô hàng" });
        }
        // Xóa document lô (chỉ xóa lô, không đụng đến Order)
        await batch.deleteOne();
        res.json({ message: "Đã xóa lô hàng" });
    } catch (error) {
        console.error("Lỗi khi xóa lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi xóa lô hàng" });
    }
});

// Xuất router để app.js mount vào, ví dụ: app.use("/api/shipments", shipmentsRouter)
module.exports = router;