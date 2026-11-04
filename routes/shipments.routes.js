// ============================================================
// routes/shipments.routes.js
// VAI TRÒ: Định tuyến HTTP cho Lô hàng nhập (Routing Layer)
// ============================================================

const express = require("express");
const router = express.Router();
const shipmentController = require("../controllers/shipment.controller");
const { requireAdmin } = require("../middleware/auth");

// Toàn bộ API lô hàng yêu cầu quyền Admin
router.use(requireAdmin);

router.get("/", shipmentController.getAllBatches);
router.post("/", shipmentController.createBatch);
router.patch("/:id/status", shipmentController.updateBatchStatus);
router.delete("/:id", shipmentController.deleteBatch);

module.exports = router;
