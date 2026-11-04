// ============================================================
// routes/products.routes.js
// VAI TRÒ: Định tuyến HTTP cho mô hình Pre-order (Routing Layer)
// ============================================================

const express = require("express");
const router = express.Router();
const productController = require("../controllers/product.controller");
const { requireAdmin } = require("../middleware/auth");

// Public routes
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);

// Admin-protected routes
router.post("/", requireAdmin, productController.createProduct);
router.put("/:id", requireAdmin, productController.updateProduct);
router.delete("/:id", requireAdmin, productController.deleteProduct);

module.exports = router;
