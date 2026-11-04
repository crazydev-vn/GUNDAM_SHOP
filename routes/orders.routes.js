// ============================================================
// routes/orders.routes.js
// VAI TRÒ: Định tuyến HTTP cho Đơn Đặt cọc (Routing Layer)
// ============================================================

const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order.controller");
const { optionalAuth, verifyToken, requireAdmin } = require("../middleware/auth");

// Public / Khách đặt đơn (hỗ trợ cả guest và logged-in user)
router.post("/", optionalAuth, orderController.createOrder);
router.post("/lookup", orderController.lookupOrder);
router.post("/address", orderController.updateAddress);

// User đã đăng nhập: xem danh sách đơn của mình
router.get("/my-orders", verifyToken, orderController.getMyOrders);

// Admin-protected routes
router.get("/", requireAdmin, orderController.getAllOrders);
router.patch("/:id/status", requireAdmin, orderController.updateOrderStatus);
router.delete("/:id", requireAdmin, orderController.deleteOrder);

module.exports = router;
