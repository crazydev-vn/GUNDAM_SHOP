// ============================================================
// models/Order.js  (Order_PreOrder)
// VAI TRÒ: 1 đơn ĐẶT CỌC cho 1 mô hình, lưu trong collection "orders".
// Khách đặt giỏ nhiều mô hình -> server tạo MỖI MÔ HÌNH 1 đơn cọc riêng
// (vì mỗi mô hình có hạn chót, lô hàng và trạng thái riêng).
//
// Đối chiếu với tài liệu thiết kế:
//   order_id              -> _id của MongoDB
//   user_id               -> số điện thoại khách (shop chưa có tài khoản đăng nhập)
//   product_id            -> product_id
//   deposit_tier          -> 30 | 50 | 100 (% cọc đợt 1)
//   deposit_amount        -> tiền cọc đợt 1
//   second_payment_amount -> tiền thanh toán đợt 2 (khi hàng về)
//   order_status          -> Pending_Deposit | Deposited | Waiting_For_Address |
//                            Ready_To_Ship | Completed | Forfeited
//   shipping_address      -> KHÔNG bắt buộc lúc đặt, bổ sung khi hàng về kho
//   phone_number          -> phone_number
//   created_at            -> created_at
// Trường thêm để đơn đọc được và đúng giá khi giá sản phẩm đổi:
//   customer_name, product_name, unit_price (giá tổng/1 mô hình), quantity, image, note
// ============================================================

const mongoose = require("mongoose");

const ORDER_STATUSES = [
    "Pending_Deposit",     // vừa đặt, chờ khách chuyển khoản cọc
    "Deposited",           // đã nhận cọc, chờ hàng về
    "Waiting_For_Address", // hàng đã về kho VN, chờ khách xác nhận địa chỉ + trả đợt 2
    "Ready_To_Ship",       // đủ tiền + địa chỉ, sẵn sàng giao
    "Completed",           // đã giao xong
    "Forfeited",           // khách bỏ đơn -> xả cọc
];
const DEPOSIT_TIERS = [30, 50, 100];

const orderSchema = new mongoose.Schema(
    {
        user_id: { type: String, required: true, trim: true },
        customer_name: { type: String, required: true, trim: true },
        phone_number: { type: String, required: true, match: /^[0-9]{10}$/ },
        shipping_address: { type: String, default: "" },
        note: { type: String, default: "" },

        product_id: { type: Number, required: true, index: true },
        product_name: { type: String, required: true },
        unit_price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        image: { type: String },

        deposit_tier: { type: Number, required: true, enum: DEPOSIT_TIERS },
        deposit_amount: { type: Number, required: true, min: 0 },
        second_payment_amount: { type: Number, required: true, min: 0 },

        order_status: { type: String, enum: ORDER_STATUSES, default: "Pending_Deposit" },
    },
    {
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
        versionKey: false,
    }
);

const Order = mongoose.model("Order", orderSchema);
Order.ORDER_STATUSES = ORDER_STATUSES;
Order.DEPOSIT_TIERS = DEPOSIT_TIERS;
module.exports = Order;