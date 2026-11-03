// ============================================================
// models/Product.js  (Product_PreOrder)
// VAI TRÒ: khuôn mẫu 1 mô hình PRE-ORDER trong collection "products".
//
// Đối chiếu với thuộc tính trong tài liệu thiết kế:
//   product_id            -> id            (giữ tên "id" dạng số vì frontend dùng ?id=1)
//   product_name          -> name          (giữ tên "name" cho frontend)
//   deposit_price         -> deposit_price (giá cọc đợt 1 TỐI THIỂU cho mỗi mô hình)
//   total_price           -> total_price   (thay cho "price" cũ)
//   total_slots           -> total_slots   (tổng slot phát hành)
//   remaining_slots       -> remaining_slots (thay cho "stock" cũ, trừ ngay khi có đơn cọc)
//   cut_off_date          -> cut_off_date  (hạn chót đặt cọc)
//   release_quarter_year  -> release_quarter_year (vd "Q3/2027")
//   po_status             -> po_status     (Open | Closing Soon | Closed)
//   variants_bonus        -> variants_bonus (mảng: biến thể / quà tặng kèm)
// Các trường "unit" và "origin" của đặc sản cũ đã bỏ vì không còn dùng.
// ============================================================

const mongoose = require("mongoose");

const PO_STATUSES = ["Open", "Closing Soon", "Closed"];
const CLOSING_SOON_DAYS = 3;        // còn <= 3 ngày tới hạn chót -> "Closing Soon"
const CLOSING_SOON_SLOT_RATIO = 0.1; // còn <= 10% slot -> "Closing Soon"

const isInteger = { validator: Number.isInteger, message: "{PATH} phải là số nguyên." };

const productSchema = new mongoose.Schema(
    {
        id: { type: Number, required: true, unique: true },
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, index: true }, // hg, rg, mg, pg, sd...
        deposit_price: { type: Number, required: true, min: 0 },
        total_price: { type: Number, required: true, min: 0 },
        total_slots: { type: Number, required: true, min: 1, validate: isInteger },
        remaining_slots: { type: Number, required: true, min: 0, validate: isInteger },
        cut_off_date: { type: Date, required: true },
        release_quarter_year: { type: String, required: true, match: /^Q[1-4]\/[0-9]{4}$/ },
        po_status: { type: String, enum: PO_STATUSES, default: "Open" },
        variants_bonus: { type: [String], default: [] },
        image: { type: String, required: true },
        description: { type: String, default: "" },
        featured: { type: Boolean, default: false },
    },
    { timestamps: true, versionKey: false }
);

// Trạng thái PO THỰC TẾ, tự tính theo slot + hạn chót (không cần ai cập nhật tay):
//   - hết slot, quá hạn chót, hoặc admin đặt "Closed"  -> Closed
//   - admin đặt "Closing Soon", hoặc sắp hết hạn/hết slot -> Closing Soon
//   - còn lại -> Open
function resolvePoStatus(product, now = new Date()) {
    const slots = Number(product.remaining_slots);
    const total = Number(product.total_slots);
    const cutOff = new Date(product.cut_off_date);

    if (slots <= 0 || cutOff <= now || product.po_status === "Closed") return "Closed";
    if (product.po_status === "Closing Soon") return "Closing Soon";

    const soon = cutOff - now <= CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000;
    const fewSlots = total > 0 && slots / total <= CLOSING_SOON_SLOT_RATIO;
    return soon || fewSlots ? "Closing Soon" : "Open";
}

// Khi trả JSON: bỏ _id nội bộ và ghi đè po_status bằng trạng thái thực tế
productSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret._id;
        ret.po_status = resolvePoStatus(ret);
        return ret;
    },
});

const Product = mongoose.model("Product", productSchema);
Product.PO_STATUSES = PO_STATUSES;
Product.resolvePoStatus = resolvePoStatus;
module.exports = Product;