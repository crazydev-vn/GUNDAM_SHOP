// ============================================================
// controllers/product.controller.js
// VAI TRÒ: Điều khiển dữ liệu mô hình Pre-order (Catalog Core)
// ============================================================

const Product = require("../models/Product");

// Mã danh mục hợp lệ
const CATEGORIES = ["hg", "rg", "mg", "pg", "sd", "phu-kien", "khac"];

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORTS = {
    id_asc: { id: 1 },
    price_asc: { total_price: 1, id: 1 },
    price_desc: { total_price: -1, id: 1 },
    name_asc: { name: 1, id: 1 },
    newest: { createdAt: -1, id: -1 },
    cut_off_asc: { cut_off_date: 1, id: 1 },
};

function toNum(value) {
    return value === undefined || value === null || value === "" ? NaN : Number(value);
}

function buildProduct(input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length < 2) return { error: "Tên mô hình phải có ít nhất 2 ký tự." };

    if (!CATEGORIES.includes(input.category)) {
        return { error: `Danh mục không hợp lệ. Chọn một trong: ${CATEGORIES.join(", ")}` };
    }

    const total_price = toNum(input.total_price);
    if (!Number.isFinite(total_price) || total_price < 0) {
        return { error: "Giá tổng (total_price) phải là số không âm." };
    }
    const deposit_price = toNum(input.deposit_price);
    if (!Number.isFinite(deposit_price) || deposit_price < 0 || deposit_price > total_price) {
        return { error: "Giá cọc (deposit_price) phải là số không âm và không vượt quá giá tổng." };
    }

    const total_slots = toNum(input.total_slots);
    if (!Number.isInteger(total_slots) || total_slots < 1) {
        return { error: "Tổng slot (total_slots) phải là số nguyên từ 1 trở lên." };
    }
    const remaining_slots = input.remaining_slots === undefined ? total_slots : toNum(input.remaining_slots);
    if (!Number.isInteger(remaining_slots) || remaining_slots < 0 || remaining_slots > total_slots) {
        return { error: "Slot còn lại (remaining_slots) phải là số nguyên từ 0 đến total_slots." };
    }

    const cut_off_date = new Date(input.cut_off_date);
    if (input.cut_off_date === undefined || Number.isNaN(cut_off_date.getTime())) {
        return { error: "Hạn chót đặt cọc (cut_off_date) không hợp lệ, ví dụ: 2026-12-15T23:59:59+07:00." };
    }

    const release_quarter_year = String(input.release_quarter_year ?? "").trim();
    if (!/^Q[1-4]\/[0-9]{4}$/.test(release_quarter_year)) {
        return { error: "Quý phát hành (release_quarter_year) phải có dạng Q1/2027." };
    }

    const po_status = input.po_status === undefined ? "Open" : input.po_status;
    if (!Product.PO_STATUSES.includes(po_status)) {
        return { error: `po_status không hợp lệ. Chọn một trong: ${Product.PO_STATUSES.join(", ")}` };
    }

    const bonusRaw = input.variants_bonus === undefined ? [] : input.variants_bonus;
    if (!Array.isArray(bonusRaw)) {
        return { error: "variants_bonus phải là một mảng chuỗi, ví dụ: [\"Standee acrylic\"]." };
    }
    const variants_bonus = bonusRaw.map((item) => String(item).trim()).filter(Boolean);

    const image = String(input.image ?? "").trim();
    if (!image) return { error: "Thiếu đường dẫn ảnh (image), ví dụ: images/ten-anh.png." };

    return {
        value: {
            name,
            category: input.category,
            deposit_price,
            total_price,
            total_slots,
            remaining_slots,
            cut_off_date,
            release_quarter_year,
            po_status,
            variants_bonus,
            image,
            description: input.description ? String(input.description).trim() : "",
            featured: Boolean(input.featured),
        },
    };
}

// GET /api/products
exports.getAllProducts = async (req, res) => {
    try {
        const { search, category, price } = req.query;
        const filter = {};

        if (search && typeof search === "string") {
            const keyword = escapeRegex(search.trim());
            if (keyword) {
                filter.$or = [
                    { name: { $regex: keyword, $options: "i" } },
                    { description: { $regex: keyword, $options: "i" } },
                ];
            }
        }

        if (category && typeof category === "string" && category !== "all") {
            filter.category = category;
        }

        if (price === "under-500") {
            filter.total_price = { $lt: 500000 };
        } else if (price === "500-2000") {
            filter.total_price = { $gte: 500000, $lte: 2000000 };
        } else if (price === "over-2000") {
            filter.total_price = { $gt: 2000000 };
        }

        if (req.query.featured === "true") {
            filter.featured = true;
        }

        const sort = SORTS[req.query.sort] || SORTS.id_asc;

        if (req.query.page === undefined && req.query.limit === undefined) {
            const products = await Product.find(filter).sort(sort);
            return res.json(products);
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

        const [total, data] = await Promise.all([
            Product.countDocuments(filter),
            Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        ]);

        res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error("Lỗi khi lấy danh sách mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi lấy danh sách mô hình" });
    }
};

// GET /api/products/:id
exports.getProductById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Mã sản phẩm không hợp lệ" });
        }
        const product = await Product.findOne({ id });
        if (!product) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        }
        res.json(product);
    } catch (error) {
        console.error("Lỗi khi lấy chi tiết mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi lấy chi tiết mô hình" });
    }
};

// POST /api/products (chỉ Admin)
exports.createProduct = async (req, res) => {
    try {
        const { error, value } = buildProduct(req.body || {});
        if (error) return res.status(400).json({ error });

        const last = await Product.findOne().sort({ id: -1 });
        const newId = last ? last.id + 1 : 1;

        const product = await Product.create({ id: newId, ...value });
        res.status(201).json(product);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "Trùng mã sản phẩm, vui lòng thử lại." });
        }
        if (error.name === "ValidationError") {
            return res.status(400).json({ error: error.message });
        }
        console.error("Lỗi khi thêm mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi thêm mô hình" });
    }
};

// PUT /api/products/:id (chỉ Admin)
exports.updateProduct = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Mã sản phẩm không hợp lệ" });
        }

        const allowed = [
            "name", "category", "deposit_price", "total_price", "total_slots", "remaining_slots",
            "cut_off_date", "release_quarter_year", "po_status", "variants_bonus",
            "image", "description", "featured",
        ];
        const updates = {};
        for (const key of allowed) {
            if (req.body && req.body[key] !== undefined) updates[key] = req.body[key];
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: "Không có trường nào để cập nhật." });
        }

        const existing = await Product.findOne({ id });
        if (!existing) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        }

        const { error, value } = buildProduct({ ...existing.toObject(), ...updates });
        if (error) return res.status(400).json({ error });

        const product = await Product.findOneAndUpdate(
            { id },
            { $set: value },
            { new: true, runValidators: true }
        );
        res.json(product);
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ error: error.message });
        }
        console.error("Lỗi khi cập nhật mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi cập nhật mô hình" });
    }
};

// DELETE /api/products/:id (chỉ Admin)
exports.deleteProduct = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Mã sản phẩm không hợp lệ" });
        }
        const deleted = await Product.findOneAndDelete({ id });
        if (!deleted) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        }
        res.json({ message: "Đã xóa sản phẩm", product: deleted });
    } catch (error) {
        console.error("Lỗi khi xóa mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi xóa mô hình" });
    }
};
