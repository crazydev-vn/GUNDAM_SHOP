// ============================================================
// routes/auth.routes.js
// VAI TRÒ: Định tuyến HTTP cho Xác thực & Tài khoản (Auth Routing)
// ============================================================

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth");

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);

// Private routes (cần JWT token)
router.get("/me", verifyToken, authController.getProfile);
router.put("/me", verifyToken, authController.updateProfile);

module.exports = router;
