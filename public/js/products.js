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
// So sánh window.location.port (port hiện tại của trang) với "3000" (port server Node):
//   - Nếu đang chạy qua server Node (port 3000) -> để "" (gọi relative URL, cùng origin)
//   - Nếu đang chạy qua Live Server (port 5500/5501...) -> trỏ thẳng sang http://localhost:3000
// Đây là cách xử lý đơn giản cho môi trường dev, tránh phải cấu hình proxy.

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

// Biến toàn cục (global) lưu danh sách sản phẩm sau khi tải xong.
// Các file khác (main.js, product-detail.js...) đọc trực tiếp biến này.
// Khai báo bằng "let" để có thể gán lại (products = ...).
let products = [];  // nơi chứa danh sách sản phẩm sau khi tải xong

// Hàm bất đồng bộ (async) tải danh sách sản phẩm từ API
// - Dùng async/await để code dễ đọc hơn promise chain
// - Không throw ra ngoài vì đã catch; luôn kết thúc bằng cách phát sự kiện
async function loadProducts() {
    try {
        // fetch = gửi yêu cầu tới API, server trả về chuỗi JSON
        const response = await fetch(`${API_BASE}/api/products`);
        // response.ok = true nếu HTTP status 200-299; nếu không thì ném lỗi
        if (!response.ok) throw new Error("Không tải được dữ liệu từ /api/products");
        // Parse JSON thành mảng object và gán vào biến global "products"
        products = await response.json();
    } catch (error) {
        // Log lỗi để debug (mất mạng, server tắt, 500...)
        console.error("Lỗi khi tải dữ liệu sản phẩm:", error);
        // Gán mảng rỗng để các nơi khác dùng "products" không bị lỗi undefined
        products = [];
    } finally {
        // Phát tín hiệu "đã tải xong" để main.js và trang chi tiết biết mà vẽ ra màn hìn
        // Dùng CustomEvent thay vì gọi trực tiếp hàm render, vì:
        //   - products.js không biết main.js có tồn tại hay không (tách rời module)
        //   - Nhiều nơi có thể cùng lắng nghe sự kiện này (main.js, product-detail.js...)
        // "finally" đảm bảo sự kiện LUÔN được phát, dù fetch thành công hay thất bại.
        document.dispatchEvent(new CustomEvent("products-loaded"));
    }
}

loadProducts(); // chạy ngay khi trang mở