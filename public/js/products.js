// ============================================================
// VAI TRÒ: chạy TRÊN TRÌNH DUYỆT. Gọi API để lấy danh sách sản phẩm
// rồi lưu vào biến "products" cho các file khác (main.js...) dùng.
// ============================================================

// ============================================================
// Đọc dữ liệu sản phẩm từ API backend (GET /api/products)
// - Mở trang qua http://localhost:3000  -> gọi API cùng địa chỉ
// - Mở trang qua Live Server (cổng 5501...) -> tự gọi sang
//   server Node ở http://localhost:3000 (server đã bật CORS)
// LƯU Ý: luôn phải chạy "npm run dev" để có API.
// ============================================================

// Địa chỉ gốc của API:
// - Mở trang qua localhost:3000 -> để trống (gọi cùng địa chỉ).
// - Mở trang qua Live Server (cổng khác) -> gọi sang server Node ở cổng 3000.

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

let products = [];  // nơi chứa danh sách sản phẩm sau khi tải xong

async function loadProducts() {
    try {
        // fetch = gửi yêu cầu tới API, server trả về chuỗi JSON
        const response = await fetch(`${API_BASE}/api/products`);
        if (!response.ok) throw new Error("Không tải được dữ liệu từ /api/products");
        products = await response.json();
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu sản phẩm:", error);
        products = [];
    } finally {
        // Phát tín hiệu "đã tải xong" để main.js và trang chi tiết biết mà vẽ ra màn hìn
        document.dispatchEvent(new CustomEvent("products-loaded"));
    }
}

loadProducts(); // chạy ngay khi trang mở