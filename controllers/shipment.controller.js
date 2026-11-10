// ============================================================
// controllers/shipment.controller.js
// VAI TRÒ: Điều khiển quản lý Lô hàng nhập kho quốc tế (Logistics)
// ============================================================

const mongoose = require("mongoose");
const ShipmentBatch = require("../models/ShipmentBatch");
const Order = require("../models/Order");

function parseBatchId(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Mã lô hàng không hợp lệ" });
        return null;
    }
    return id;
}

// GET /api/shipments
exports.getAllBatches = async (req, res) => {
    try {
        const batches = await ShipmentBatch.find()
            .sort({ batch_id: -1 })
            .populate("associated_orders", "customer_name product_name quantity order_status");
        res.json(batches);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi lấy danh sách lô hàng" });
    }
};

// POST /api/shipments
exports.createBatch = async (req, res) => {
    try {
        const { tracking_code, associated_orders } = req.body || {};

        const code = typeof tracking_code === "string" ? tracking_code.trim() : "";
        if (code.length < 5) {
            return res.status(400).json({ error: "Mã vận chuyển quốc tế (tracking_code) phải có ít nhất 5 ký tự." });
        }
        if (!Array.isArray(associated_orders) || associated_orders.length === 0) {
            return res.status(400).json({ error: "associated_orders phải là mảng mã đơn hàng, ít nhất 1 đơn." });
        }
        const ids = [...new Set(associated_orders.map(String))];
        if (!ids.every((id) => mongoose.isValidObjectId(id))) {
            return res.status(400).json({ error: "Có mã đơn hàng sai định dạng." });
        }

        // Chỉ đơn đã nhận cọc (Deposited) mới được đưa vào lô
        const orders = await Order.find({ _id: { $in: ids } });
        if (orders.length !== ids.length) {
            return res.status(400).json({ error: "Có mã đơn hàng không tồn tại." });
        }
        const notDeposited = orders.find((o) => o.order_status !== "Deposited");
        if (notDeposited) {
            return res.status(400).json({
                error: `Đơn ${notDeposited._id} đang ở trạng thái ${notDeposited.order_status}, chỉ đơn "Deposited" mới vào lô được.`,
            });
        }
        // Mỗi đơn chỉ thuộc 1 lô
        const inBatch = await ShipmentBatch.findOne({ associated_orders: { $in: ids } });
        if (inBatch) {
            return res.status(409).json({ error: `Có đơn đã nằm trong lô #${inBatch.batch_id}.` });
        }

        const last = await ShipmentBatch.findOne().sort({ batch_id: -1 });
        const batch = await ShipmentBatch.create({
            batch_id: last ? last.batch_id + 1 : 1,
            tracking_code: code,
            associated_orders: ids,
        });
        res.status(201).json(batch);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "Trùng mã vận chuyển hoặc mã lô, vui lòng kiểm tra lại." });
        }
        console.error("Lỗi khi tạo lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi tạo lô hàng" });
    }
};

// PATCH /api/shipments/:id/status
exports.updateBatchStatus = async (req, res) => {
    try {
        const batchId = parseBatchId(req, res);
        if (batchId === null) return;

        const { batch_status } = req.body || {};
        if (!ShipmentBatch.BATCH_STATUSES.includes(batch_status)) {
            return res.status(400).json({ error: `Trạng thái không hợp lệ. Chọn: ${ShipmentBatch.BATCH_STATUSES.join(", ")}` });
        }

        const batch = await ShipmentBatch.findOne({ batch_id: batchId });
        if (!batch) {
            return res.status(404).json({ error: "Không tìm thấy lô hàng" });
        }
        if (batch.batch_status === "Arrived_VN_Warehouse" && batch_status === "In_Transit") {
            return res.status(400).json({ error: "Lô đã về kho Việt Nam, không thể quay lại In_Transit." });
        }

        let notified = 0;
        if (batch_status === "Arrived_VN_Warehouse" && batch.batch_status !== "Arrived_VN_Warehouse") {
            const result = await Order.updateMany(
                { _id: { $in: batch.associated_orders }, order_status: "Deposited" },
                { $set: { order_status: "Waiting_For_Address" } }
            );
            notified = result.modifiedCount;
        }

        batch.batch_status = batch_status;
        await batch.save();
        res.json({ batch, orders_moved_to_waiting_for_address: notified });
    } catch (error) {
        console.error("Lỗi khi cập nhật lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi cập nhật lô hàng" });
    }
};

// DELETE /api/shipments/:id
exports.deleteBatch = async (req, res) => {
    try {
        const batchId = parseBatchId(req, res);
        if (batchId === null) return;

        const batch = await ShipmentBatch.findOne({ batch_id: batchId });
        if (!batch) {
            return res.status(404).json({ error: "Không tìm thấy lô hàng" });
        }
        await batch.deleteOne();
        res.json({ message: "Đã xóa lô hàng" });
    } catch (error) {
        console.error("Lỗi khi xóa lô hàng:", error);
        res.status(500).json({ error: "Lỗi server khi xóa lô hàng" });
    }
};
