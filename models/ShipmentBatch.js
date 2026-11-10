// ============================================================
// models/ShipmentBatch.js  (Shipment_Batch)
// VAI TRÒ: 1 lô hàng nhập từ nước ngoài, gom nhiều đơn cọc.
//   batch_id          -> số tự tăng 1, 2, 3... (giống id sản phẩm)
//   tracking_code     -> mã vận chuyển quốc tế (không trùng)
//   batch_status      -> In_Transit | Arrived_VN_Warehouse
//   associated_orders -> danh sách _id các đơn (Order) nằm trong lô
// ============================================================

const mongoose = require("mongoose");

const BATCH_STATUSES = ["In_Transit", "Arrived_VN_Warehouse"];

const shipmentBatchSchema = new mongoose.Schema(
    {
        batch_id: { type: Number, required: true, unique: true },
        tracking_code: { type: String, required: true, unique: true, trim: true },
        // enum: chỉ 2 trạng thái, mặc định đang trên đường
        batch_status: { type: String, enum: BATCH_STATUSES, default: "In_Transit" },
        // Mảng ObjectId tham chiếu tới Order -> populate() sẽ tự thay bằng document đầy đủ
        associated_orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    },
    { timestamps: true, versionKey: false }
);

const ShipmentBatch = mongoose.model("ShipmentBatch", shipmentBatchSchema);
ShipmentBatch.BATCH_STATUSES = BATCH_STATUSES;
module.exports = ShipmentBatch;