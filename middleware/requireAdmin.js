// ============================================================
// middleware/requireAdmin.js (wrapper chuyển tiếp sang middleware/auth.js)
// ============================================================

const { requireAdmin } = require("./auth");

module.exports = requireAdmin;
