// ============================================================
// routes/products.routes.js
// VAI TRÒ: API mô hình pre-order (lấy dữ liệu từ MongoDB).
//   GET    /api/products       -> danh sách (có thể lọc)
//   GET    /api/products/:id   -> chi tiết 1 mô hình
//   POST   /api/products       -> thêm mô hình pre-order mới (CHỈ admin)
//   PUT    /api/products/:id   -> sửa (CHỈ admin)
//   DELETE /api/products/:id   -> xóa (CHỈ admin)
// po_status trả về luôn là trạng thái THỰC TẾ (xem resolvePoStatus ở models/Product.js).
// ============================================================

// Import thư viện Express để tạo router và xử lý HTTP request/response
const express = require("express");
// Import model Product (Mongoose schema) để thao tác với collection sản phẩm trong MongoDB
const Product = require("../models/Product");
// Import middleware kiểm tra quyền admin - dùng để bảo vệ các route thêm/sửa/xóa
const requireAdmin = require("../middleware/requireAdmin");

// Tạo một đối tượng Router của Express để định nghĩa các route con
const router = express.Router();

// Mã danh mục hợp lệ (khớp với bộ lọc ở trang Sản phẩm)
// Dùng để validate trường "category" khi tạo/cập nhật sản phẩm
// hg = High Grade, rg = Real Grade, mg = Master Grade, pg = Perfect Grade,
// sd = SD, phu-kien = phụ kiện, khac = khác
const CATEGORIES = ["hg", "rg", "mg", "pg", "sd", "phu-kien", "khac"];

// Hàm escape các ký tự đặc biệt trong regex
// Mục đích: khi người dùng nhập từ khóa tìm kiếm, tránh việc các ký tự như . * + ? [ ] \ bị hiểu
// là cú pháp regex (có thể gây lỗi hoặc tấn công ReDoS). Ví dụ "a.b" sẽ thành "a\.b".
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bảng ánh xạ các kiểu sắp xếp (sort) mà client có thể yêu cầu
// Key là giá trị query "sort", value là object sort của MongoDB (1 = tăng dần, -1 = giảm dần)
// Các trường phụ (id) được thêm vào để đảm bảo thứ tự ổn định khi giá trị chính bằng nhau
const SORTS = {
    id_asc: { id: 1 },                          // theo id tăng dần (mặc định)
    price_asc: { total_price: 1, id: 1 },       // giá tăng dần
    price_desc: { total_price: -1, id: 1 },     // giá giảm dần
    name_asc: { name: 1, id: 1 },               // tên A-Z
    newest: { createdAt: -1, id: -1 },          // mới nhất lên đầu
    cut_off_asc: { cut_off_date: 1, id: 1 },    // sắp hết hạn cọc lên trước
};

// Ép về số; undefined/null/"" -> NaN để bị bắt lỗi thay vì thành 0
// Lý do: Number("") === 0 và Number(null) === 0, nếu không xử lý sẽ khiến giá trị rỗng
// bị coi là 0 một cách âm thầm, gây dữ liệu sai. Trả NaN để các kiểm tra Number.isFinite/Integer bắt được.
function toNum(value) {
    return value === undefined || value === null || value === "" ? NaN : Number(value);
}

// Kiểm tra + chuẩn hóa TOÀN BỘ trường của 1 mô hình (dùng chung cho POST và PUT).
// Trả { error } hoặc { value }.
// - input: object dữ liệu thô từ client (hoặc dữ liệu cũ đã gộp với updates khi PUT)
// - Nếu có lỗi: trả về { error: "thông báo lỗi" }
// - Nếu hợp lệ: trả về { value: { ...các trường đã chuẩn hóa... } }
function buildProduct(input) {
    // Lấy tên, trim khoảng trắng; nếu không phải string thì coi như rỗng
    const name = typeof input.name === "string" ? input.name.trim() : "";
    // Tên phải có ít nhất 2 ký tự
    if (name.length < 2) return { error: "Tên mô hình phải có ít nhất 2 ký tự." };

    // Kiểm tra category phải nằm trong danh sách CATEGORIES hợp lệ
    if (!CATEGORIES.includes(input.category)) {
        return { error: `Danh mục không hợp lệ. Chọn một trong: ${CATEGORIES.join(", ")}` };
    }

    // Ép giá tổng về số và kiểm tra: phải là số hữu hạn (không NaN/Infinity) và >= 0
    const total_price = toNum(input.total_price);
    if (!Number.isFinite(total_price) || total_price < 0) {
        return { error: "Giá tổng (total_price) phải là số không âm." };
    }
    // Ép giá cọc về số; phải >= 0 và KHÔNG được vượt quá giá tổng
    const deposit_price = toNum(input.deposit_price);
    if (!Number.isFinite(deposit_price) || deposit_price < 0 || deposit_price > total_price) {
        return { error: "Giá cọc (deposit_price) phải là số không âm và không vượt quá giá tổng." };
    }

    // Tổng số slot phải là số nguyên >= 1
    const total_slots = toNum(input.total_slots);
    if (!Number.isInteger(total_slots) || total_slots < 1) {
        return { error: "Tổng slot (total_slots) phải là số nguyên từ 1 trở lên." };
    }
    // Slot còn lại: nếu client không gửi thì mặc định = total_slots (sản phẩm mới chưa ai đặt)
    const remaining_slots = input.remaining_slots === undefined ? total_slots : toNum(input.remaining_slots);
    // Phải là số nguyên, >= 0 và <= total_slots
    if (!Number.isInteger(remaining_slots) || remaining_slots < 0 || remaining_slots > total_slots) {
        return { error: "Slot còn lại (remaining_slots) phải là số nguyên từ 0 đến total_slots." };
    }

    // Chuyển hạn chót đặt cọc sang đối tượng Date
    const cut_off_date = new Date(input.cut_off_date);
    // Nếu không truyền hoặc không parse được thành ngày hợp lệ -> lỗi
    if (input.cut_off_date === undefined || Number.isNaN(cut_off_date.getTime())) {
        return { error: "Hạn chót đặt cọc (cut_off_date) không hợp lệ, ví dụ: 2026-12-15T23:59:59+07:00." };
    }

    // Quý/năm phát hành: ép về string, trim
    const release_quarter_year = String(input.release_quarter_year ?? "").trim();
    // Phải đúng định dạng "Q1/2027" ... "Q4/2027" (Q + số 1-4 + "/" + 4 chữ số năm)
    if (!/^Q[1-4]\/[0-9]{4}$/.test(release_quarter_year)) {
        return { error: "Quý phát hành (release_quarter_year) phải có dạng Q1/2027." };
    }

    // Trạng thái pre-order: mặc định "Open" nếu client không gửi
    const po_status = input.po_status === undefined ? "Open" : input.po_status;
    // Phải nằm trong danh sách trạng thái hợp lệ của model (Product.PO_STATUSES)
    if (!Product.PO_STATUSES.includes(po_status)) {
        return { error: `po_status không hợp lệ. Chọn một trong: ${Product.PO_STATUSES.join(", ")}` };
    }

    // Danh sách quà tặng kèm (variants_bonus): mặc định là mảng rỗng nếu không gửi
    const bonusRaw = input.variants_bonus === undefined ? [] : input.variants_bonus;
    // Phải là mảng, nếu không thì báo lỗi
    if (!Array.isArray(bonusRaw)) {
        return { error: "variants_bonus phải là một mảng chuỗi, ví dụ: [\"Standee acrylic\"]." };
    }
    // Chuẩn hóa từng phần tử: ép về string, trim, loại bỏ phần tử rỗng
    const variants_bonus = bonusRaw.map((item) => String(item).trim()).filter(Boolean);

    // Đường dẫn ảnh: ép về string, trim
    const image = String(input.image ?? "").trim();
    // Bắt buộc phải có ảnh
    if (!image) return { error: "Thiếu đường dẫn ảnh (image), ví dụ: images/ten-anh.png." };

    // Tất cả hợp lệ -> trả về object đã chuẩn hóa
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
            // Mô tả: không bắt buộc, mặc định chuỗi rỗng
            description: input.description ? String(input.description).trim() : "",
            // Cờ "nổi bật": ép về boolean (truthy/falsy)
            featured: Boolean(input.featured),
        },
    };
}

// ---------- GET /api/products ----------
// Tham số (đều tùy chọn): search, category, price, featured=true,
//   price = under-500 | 500-2000 | over-2000 (đơn vị nghìn đồng, theo total_price)
//   sort = id_asc | price_asc | price_desc | name_asc | newest | cut_off_asc
//   page, limit (limit tối đa 50)
router.get("/", async (req, res) => {
    try {
        // Lấy các tham số lọc từ query string
        const { search, category, price } = req.query;
        // Object filter dùng để build query cho MongoDB
        const filter = {};

        // Nếu có từ khóa tìm kiếm và là string
        if (search && typeof search === "string") {
            // Escape ký tự đặc biệt regex để tìm kiếm an toàn
            const keyword = escapeRegex(search.trim());
            if (keyword) {
                // Tìm theo tên HOẶC mô tả (không phân biệt hoa thường)
                filter.$or = [
                    { name: { $regex: keyword, $options: "i" } },
                    { description: { $regex: keyword, $options: "i" } },
                ];
            }
        }

        // Lọc theo danh mục (bỏ qua nếu là "all")
        if (category && typeof category === "string" && category !== "all") {
            filter.category = category;
        }

        // Lọc theo khoảng giá (đơn vị: đồng, áp dụng trên total_price)
        if (price === "under-500") {
            filter.total_price = { $lt: 500000 };            // dưới 500 nghìn
        } else if (price === "500-2000") {
            filter.total_price = { $gte: 500000, $lte: 2000000 }; // từ 500k đến 2 triệu
        } else if (price === "over-2000") {
            filter.total_price = { $gt: 2000000 };           // trên 2 triệu
        }

        // Lọc chỉ lấy sản phẩm nổi bật nếu featured=true
        if (req.query.featured === "true") {
            filter.featured = true;
        }

        // Xác định kiểu sắp xếp, mặc định id_asc nếu không có/không hợp lệ
        const sort = SORTS[req.query.sort] || SORTS.id_asc;

        // Nếu client KHÔNG truyền page và limit -> trả về TOÀN BỘ danh sách (không phân trang)
        if (req.query.page === undefined && req.query.limit === undefined) {
            const products = await Product.find(filter).sort(sort);
            return res.json(products);
        }

        // Có phân trang:
        // - limit: mặc định 9, tối thiểu 1, tối đa 50
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);
        // - page: mặc định 1, tối thiểu 1
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

        // Chạy song song: đếm tổng số bản ghi và lấy dữ liệu trang hiện tại
        const [total, data] = await Promise.all([
            Product.countDocuments(filter),
            Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        ]);

        // Trả về object phân trang chuẩn
        res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        // Log lỗi ra server console để debug
        console.error("Lỗi khi lấy danh sách mô hình:", error);
        // Trả lỗi 500 cho client (không lộ chi tiết lỗi nội bộ)
        res.status(500).json({ error: "Lỗi server khi lấy danh sách mô hình" });
    }
});

// ---------- GET /api/products/:id ----------
// Lấy chi tiết 1 sản phẩm theo id (id là số thứ tự do hệ thống cấp, không phải _id của MongoDB)
router.get("/:id", async (req, res) => {
    try {
        // Ép tham số id từ URL về Number
        const id = Number(req.params.id);
        // Kiểm tra phải là số nguyên (nếu là "abc" -> NaN -> lỗi 400)
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Mã sản phẩm không hợp lệ" });
        }
        // Tìm sản phẩm theo id (trường id riêng, không phải _id)
        const product = await Product.findOne({ id });
        // Không tìm thấy -> 404
        if (!product) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        }
        // Trả về sản phẩm
        res.json(product);
    } catch (error) {
        console.error("Lỗi khi lấy chi tiết mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi lấy chi tiết mô hình" });
    }
});

// ---------- POST /api/products (chỉ admin) ----------
// Không cần gửi "id": server tự cấp số tiếp theo. Không gửi remaining_slots -> bằng total_slots.
router.post("/", requireAdmin, async (req, res) => {
    try {
        // Validate + chuẩn hóa toàn bộ dữ liệu từ body (nếu body rỗng thì dùng {})
        const { error, value } = buildProduct(req.body || {});
        // Có lỗi validate -> trả 400 kèm thông báo
        if (error) return res.status(400).json({ error });

        // Tìm sản phẩm có id lớn nhất để cấp id mới = id lớn nhất + 1
        const last = await Product.findOne().sort({ id: -1 });
        const newId = last ? last.id + 1 : 1; // Nếu chưa có sản phẩm nào thì bắt đầu từ 1

        // Tạo sản phẩm mới với id tự cấp + dữ liệu đã chuẩn hóa
        const product = await Product.create({ id: newId, ...value });
        // Trả về 201 Created kèm sản phẩm vừa tạo
        res.status(201).json(product);
    } catch (error) {
        // Lỗi trùng khóa (unique index) - ví dụ 2 request đồng thời cùng tính ra 1 id
        if (error.code === 11000) {
            return res.status(409).json({ error: "Trùng mã sản phẩm, vui lòng thử lại." });
        }
        // Lỗi validation của Mongoose schema
        if (error.name === "ValidationError") {
            return res.status(400).json({ error: error.message });
        }
        console.error("Lỗi khi thêm mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi thêm mô hình" });
    }
});

// ---------- PUT /api/products/:id (chỉ admin) ----------
// Chỉ cần gửi các trường muốn sửa, ví dụ: { "cut_off_date": "2026-12-31T23:59:59+07:00", "po_status": "Closed" }
// Server gộp với dữ liệu cũ rồi kiểm tra lại toàn bộ (vd: remaining_slots không vượt total_slots).
router.put("/:id", requireAdmin, async (req, res) => {
    try {
        // Ép id từ URL về Number
        const id = Number(req.params.id);
        // id phải là số nguyên
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Mã sản phẩm không hợp lệ" });
        }

        // Danh sách các trường được phép cập nhật (chống ghi đè các trường hệ thống như id, createdAt...)
        const allowed = [
            "name", "category", "deposit_price", "total_price", "total_slots", "remaining_slots",
            "cut_off_date", "release_quarter_year", "po_status", "variants_bonus",
            "image", "description", "featured",
        ];
        // Gom các trường client thực sự gửi (khác undefined) vào object updates
        const updates = {};
        for (const key of allowed) {
            if (req.body && req.body[key] !== undefined) updates[key] = req.body[key];
        }
        // Không có trường nào để cập nhật -> 400
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: "Không có trường nào để cập nhật." });
        }

        // Lấy dữ liệu hiện tại của sản phẩm
        const existing = await Product.findOne({ id });
        if (!existing) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        }

        // Gộp dữ liệu cũ + updates, rồi validate lại TOÀN BỘ
        // (quan trọng: vì có thể chỉ sửa total_slots nhưng remaining_slots cũ vẫn phải <= total_slots mới)
        const { error, value } = buildProduct({ ...existing.toObject(), ...updates });
        if (error) return res.status(400).json({ error });

        // Cập nhật sản phẩm, trả về bản ghi mới sau khi update
        const product = await Product.findOneAndUpdate(
            { id },
            { $set: value },
            { new: true, runValidators: true } // new: trả về bản sau update; runValidators: chạy validate schema
        );
        res.json(product);
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ error: error.message });
        }
        console.error("Lỗi khi cập nhật mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi cập nhật mô hình" });
    }
});

// ---------- DELETE /api/products/:id (chỉ admin) ----------
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        // Ép id từ URL về Number
        const id = Number(req.params.id);
        // id phải là số nguyên
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: "Mã sản phẩm không hợp lệ" });
        }
        // Tìm và xóa sản phẩm theo id, trả về document đã xóa (hoặc null nếu không có)
        const deleted = await Product.findOneAndDelete({ id });
        if (!deleted) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
        }
        // Đơn cọc cũ không bị ảnh hưởng vì đã lưu sẵn tên + giá lúc đặt (xem Order.js)
        // -> Nghĩa là xóa sản phẩm không làm hỏng dữ liệu đơn hàng đã đặt trước đó
        res.json({ message: "Đã xóa sản phẩm", product: deleted });
    } catch (error) {
        console.error("Lỗi khi xóa mô hình:", error);
        res.status(500).json({ error: "Lỗi server khi xóa mô hình" });
    }
});

// Xuất router để app.js (hoặc server.js) mount vào, ví dụ: app.use("/api/products", productsRouter)
module.exports = router;