// ============================================================
// public/js/main.js
// VAI TRÒ: chạy TRÊN TRÌNH DUYỆT, xử lý giao diện:
//   - vẽ danh sách sản phẩm, tìm kiếm/lọc
//   - giỏ hàng (lưu trong localStorage của trình duyệt)
//   - gửi đơn hàng lên API
// Dữ liệu sản phẩm lấy từ biến "products" do products.js nạp sẵn.
// ============================================================

// ---------- Hàm tiện ích ----------

// Chống chèn mã HTML độc hại khi in dữ liệu ra trang
function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
// Chuyển cách hiện giá vd: 150000 -> "150.000 đ"
function formatVND(number) {
    return Number(number).toLocaleString("vi-VN") + " đ";
}

// ---------- Tiện ích PRE-ORDER ----------
const PO_LABELS = { "Open": "Đang mở cọc", "Closing Soon": "Sắp chốt cọc", "Closed": "Đã đóng cọc" };
const PO_CLASSES = { "Open": "po-open", "Closing Soon": "po-closing", "Closed": "po-closed" };

// Nhãn màu cho po_status (Open / Closing Soon / Closed)
function poBadge(status) {
    const key = PO_LABELS[status] ? status : "Closed";
    return `<span class="po-badge ${PO_CLASSES[key]}">${PO_LABELS[key]}</span>`;
}
// Mô hình còn nhận cọc được không (PO chưa đóng và còn slot)
function isPoOpen(product) {
    return Boolean(product) && product.po_status !== "Closed" && product.remaining_slots > 0;
}
function formatDate(value) {
    const date = new Date(value);
    return isNaN(date) ? "—" : date.toLocaleDateString("vi-VN");
}
// Tiền cọc đợt 1 theo mức cọc (30/50/100%) - công thức giống hệt server
function depositAmount(total, tier) {
    return Math.round((total * tier) / 100);
}
// Thanh hiển thị slot còn lại / tổng slot
function slotBar(product) {
    const total = Number(product.total_slots) || 0;
    const left = Number(product.remaining_slots) || 0;
    const percent = total > 0 ? Math.round((left / total) * 100) : 0;
    return `<div class="slot-bar" role="img" aria-label="Còn ${left} trên ${total} slot"><span style="width:${percent}%"></span></div>`;
}

// Hiện thông báo nhỏ ở đáy màn hình trong 2,5 giây (thay cho alert)
function showToast(message) {
    let toast = document.querySelector("#toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.setAttribute("role", "status");
        toast.style.cssText =
            "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
            "background:#14213d;color:#ffffff;padding:12px 20px;border-radius:8px;" +
            "z-index:2000;box-shadow:0 8px 16px rgba(0,0,0,.25);max-width:90%;" +
            "text-align:center;transition:opacity .3s;opacity:0;pointer-events:none;";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => (toast.style.opacity = "0"), 2500);
}

// ============================================================
// 1. GIỎ HÀNG (lưu trong localStorage, mỗi dòng: id, name, total_price, deposit_price, image, remaining_slots, quantity)
// ============================================================

// Làm sạch dữ liệu giỏ cũ: gộp dòng trùng, thêm quantity nếu thiếu
function normalizeCart(raw) {
    if (!Array.isArray(raw)) return [];
    const map = new Map();
    raw.forEach((item) => {
        if (!item || !Number.isInteger(item.id)) return;
        const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        if (map.has(item.id)) {
            map.get(item.id).quantity += qty;
        } else {
            map.set(item.id, {
                id: item.id,
                name: item.name,
                // item.price / item.stock là tên cũ của giỏ đã lưu trước khi chuyển sang pre-order
                total_price: Number(item.total_price ?? item.price) || 0,
                deposit_price: Number(item.deposit_price) || 0,
                image: item.image,
                remaining_slots: item.remaining_slots ?? item.stock,
                quantity: qty,
            });
        }
    });
    return [...map.values()];
}

// Đọc giỏ hàng đã lưu trong trình duyệt (lỗi thì coi như giỏ trống)
function loadCart() {
    try {
        return normalizeCart(JSON.parse(localStorage.getItem("cart")));
    } catch (error) {
        return [];
    }
}

let cart = loadCart();  // giỏ hàng hiện tại

function getCartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0);  // tổng số món
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.total_price * item.quantity, 0);  // tổng giá trị
}

// Cập nhật con số trên chữ "Giỏ hàng (n)" ở menu
function updateCartCount() {
    document.querySelectorAll("#cart-count").forEach((el) => (el.textContent = getCartCount()));
}

// Lưu giỏ vào localStorage để tải lại trang vẫn còn
function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
}

// Thêm mô hình vào giỏ (cộng dồn số lượng, không vượt quá số slot còn lại)
function addToCart(product, quantity = 1) {
    if (!isPoOpen(product)) {
        showToast("Mô hình này đã đóng cọc hoặc hết slot.");
        return false;
    }
    const existing = cart.find((item) => item.id === product.id);
    const current = existing ? existing.quantity : 0;

    if (current + quantity > product.remaining_slots) {
        showToast(`Chỉ còn ${product.remaining_slots} slot "${product.name}" (bạn đã có ${current} trong giỏ).`);
        return false;
    }
    if (current + quantity > 99) {
        showToast("Mỗi mô hình chỉ đặt tối đa 99 slot một lần.");
        return false;
    }

    if (existing) {
        existing.quantity += quantity;
        existing.remaining_slots = product.remaining_slots;
        existing.total_price = product.total_price;
        existing.deposit_price = product.deposit_price;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            total_price: product.total_price,
            deposit_price: product.deposit_price,
            image: product.image,
            remaining_slots: product.remaining_slots,
            quantity,
        });
    }
    saveCart();
    showToast(`Đã thêm "${product.name}" vào giỏ hàng!`);
    return true;
}

// ============================================================
// 2. Khi DOM tải xong
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    updateCartCount();

    // Lấy các phần tử HTML cần dùng (trang nào không có thì giá trị là null)
    const productList = document.querySelector("#product-list");    // khung chứa thẻ sản phẩm
    const searchInput = document.querySelector("#search-input");    // ô tìm kiếm
    const categoryFilter = document.querySelector("#category-select");  // chọn danh mục
    const priceFilter = document.querySelector("#price-select");    // chọn khoảng giá
    const filterBtn = document.querySelector("#filter-btn");    // nút "Lọc sản phẩm"
    const orderForm = document.querySelector("#order-form");    // form đặt hàng (contact.html)

    // ----------------------------------------------------------
    // VẼ DANH SÁCH SẢN PHẨM (products.html)
    // Nhận vào 1 mảng sản phẩm -> tạo HTML thẻ cho từng sản phẩm
    // ----------------------------------------------------------
    function renderProducts(items) {
        if (!productList) return;

        if (items.length === 0) {
            productList.innerHTML =
                '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">Không có sản phẩm phù hợp.</p>';
            return;
        }

        productList.innerHTML = items
            .map((product) => {
                const open = isPoOpen(product);
                const bonus = Array.isArray(product.variants_bonus) ? product.variants_bonus : [];
                return `
            <article class="product-card">
                <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">
                <div class="content">
                    <p>${poBadge(product.po_status)}</p>
                    <h3>${escapeHTML(product.name)}</h3>
                    <p style="font-size: 0.9rem; margin: 8px 0; color: var(--color-text);">${escapeHTML(product.description)}</p>
                    <p class="price">Tổng: ${formatVND(product.total_price)}</p>
                    <p style="font-size: 0.9rem; font-weight: 600;">Cọc đợt 1 từ ${formatVND(product.deposit_price)}</p>
                    <div class="po-meta">
                        <span>Còn ${product.remaining_slots}/${product.total_slots} slot</span>
                        ${slotBar(product)}
                        <span>Hạn chót cọc: ${formatDate(product.cut_off_date)}</span>
                        <span>Dự kiến phát hành: ${escapeHTML(product.release_quarter_year)}</span>
                        ${bonus.length ? `<span>Kèm quà: ${bonus.map(escapeHTML).join(", ")}</span>` : ""}
                    </div>
                    <div class="actions">
                        <a href="product-detail.html?id=${product.id}" class="btn btn-outline" style="margin-bottom: 8px; display: block; text-align: center;">Chi tiết sản phẩm</a>
                        <button type="button" class="btn" data-id="${product.id}" style="width: 100%;${open ? '' : ' opacity: 0.6; cursor: not-allowed;'}" ${open ? "" : "disabled"}>${open ? "Thêm vào giỏ hàng" : "Đã đóng cọc"}</button>
                    </div>
                </div>
            </article>`;
            })
            .join("");
    }

    // TÌM KIẾM + LỌC
    // Lọc ngay trên mảng "products" đã tải từ API (không gọi API lại mỗi lần gõ).
    // Bỏ dấu tiếng Việt nên gõ "ca phe" vẫn ra "Cà phê".
    async function handleFilterAndSearch() {
        try {
            // Nếu mảng products còn rỗng (chưa tải xong) thì tải ngay từ API
            if (!Array.isArray(products) || products.length === 0) {
                const response = await fetch(`${API_BASE}/api/products`);
                if (!response.ok) throw new Error("API trả về lỗi " + response.status);
                products = await response.json();
            }

            // Bỏ dấu + chuyển chữ thường: "Cà Phê" -> "ca phe"
            const normalize = (text) =>
                String(text ?? "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/đ/g, "d")
                    .replace(/Đ/g, "d")
                    .toLowerCase();

            const keyword = normalize(searchInput ? searchInput.value.trim() : "");
            const category = categoryFilter ? categoryFilter.value : "all";
            const priceRange = priceFilter ? priceFilter.value : "all";

            // Giữ lại sản phẩm nào thỏa CẢ 3 điều kiện
            const matched = products.filter((product) => {
                // 1. Tên chứa từ khóa (không phân biệt hoa thường, có dấu hay không)
                if (keyword && !normalize(product.name).includes(keyword)) return false;

                // 2. đúng danh mục
                if (category !== "all" && product.category !== category) return false;

                // 3. đúng khoảng giá
                if (priceRange === "under-500" && !(product.total_price < 500000)) return false;
                if (priceRange === "500-2000" && !(product.total_price >= 500000 && product.total_price <= 2000000)) return false;
                if (priceRange === "over-2000" && !(product.total_price > 2000000)) return false;

                return true;
            });

            if (matched.length === 0) {
                productList.innerHTML =
                    '<p style="grid-column: 1/-1; text-align: center; padding: 40px; font-size: 1.1rem;">' +
                    "Không tìm thấy sản phẩm phù hợp với từ khóa hoặc bộ lọc của bạn.</p>";
                return;
            }

            renderProducts(matched);    // vẽ kết quả đã lọc
        } catch (error) {
            console.error("Lỗi khi lọc sản phẩm:", error);
            if (productList) {
                productList.innerHTML =
                    '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">Có lỗi xảy ra, vui lòng thử lại.</p>';
            }
        }
    }

    // Gõ chữ: đợi ngừng gõ 300ms mới tìm (tránh chạy liên tục mỗi phím)
    let searchTimer;
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(handleFilterAndSearch, 300);
        });
        // Nhấn Enter trong ô tìm kiếm cũng lọc ngay
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                clearTimeout(searchTimer);
                handleFilterAndSearch();
            }
        });
    }
    // Đổi danh mục / khoảng giá hoặc bấm nút "Lọc" cũng chạy lọc
    if (categoryFilter) categoryFilter.addEventListener("change", handleFilterAndSearch);
    if (priceFilter) priceFilter.addEventListener("change", handleFilterAndSearch);
    if (filterBtn) filterBtn.addEventListener("click", handleFilterAndSearch);

    // Bấm nút "Thêm vào giỏ hàng" trên thẻ sản phẩm.
    // Gắn 1 lần vào khung cha, nút nào được bấm thì xử lý (dù thẻ được vẽ lại nhiều lần).
    if (productList) {
        productList.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-id]");
            if (!button || button.disabled) return;
            const productId = Number(button.dataset.id);
            const product = products.find((item) => item.id === productId);
            if (product) addToCart(product, 1);
        });
    }

    // POPUP GIỎ HÀNG (có ở mọi trang)
    const cartIcon = document.querySelector("#cart-icon");
    const cartModal = document.querySelector("#cart-modal");
    const closeCart = document.querySelector("#close-cart");
    const cartItemsContainer = document.querySelector("#cart-items");
    const cartTotalPrice = document.querySelector("#cart-total-price");
    const orderSummary = document.querySelector("#order-summary"); // chỉ có ở contact.html

    // Vẽ danh sách món trong popup giỏ hàng
    function renderCartUI() {
        if (!cartItemsContainer) return;

        if (cart.length === 0) {
            cartItemsContainer.innerHTML =
                '<p style="text-align:center; color: gray; padding: 20px;">Giỏ hàng của bạn đang trống.</p>';
            if (cartTotalPrice) cartTotalPrice.textContent = "0 đ";
            return;
        }

        cartItemsContainer.innerHTML = cart
            .map(
                (item) => `
            <div class="cart-item" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" style="width: 50px; height: 50px; object-fit: contain; background: #fff; border: 1px solid var(--color-border); border-radius: 4px;">
                <div class="cart-item-info" style="flex-grow: 1;">
                    <h4 style="font-size: 0.95rem; margin: 0;">${escapeHTML(item.name)}</h4>
                    <p style="color: var(--color-primary); font-weight: bold; margin: 0; font-size: 0.9rem;">${formatVND(item.total_price)}</p>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <button type="button" class="btn btn-outline" data-action="dec" data-id="${item.id}" aria-label="Giảm số lượng" style="padding: 0 8px;">−</button>
                        <span aria-live="polite">${item.quantity}</span>
                        <button type="button" class="btn btn-outline" data-action="inc" data-id="${item.id}" aria-label="Tăng số lượng" style="padding: 0 8px;">+</button>
                    </div>
                </div>
                <button type="button" class="btn btn-outline" data-action="remove" data-id="${item.id}" style="padding: 2px 8px; font-size: 0.8rem;">Xóa</button>
            </div>`
            )
            .join("");

        if (cartTotalPrice) cartTotalPrice.textContent = formatVND(getCartTotal());
    }

    // Mức cọc đợt 1 người dùng đang chọn (30 / 50 / 100), chỉ có ở contact.html
    const tierSelect = document.querySelector("#deposit-tier");
    function getSelectedTier() {
        return tierSelect ? Number(tierSelect.value) : 30;
    }
    // Tiền cọc đợt 1 của cả giỏ (cộng từng dòng để khớp cách server tính)
    function getCartDeposit(tier) {
        return cart.reduce((sum, item) => sum + depositAmount(item.total_price * item.quantity, tier), 0);
    }
    // Mô hình nào có mức cọc tối thiểu cao hơn mức khách chọn (nếu có)
    function findBelowMinimum(tier) {
        return cart.find(
            (item) => depositAmount(item.total_price * item.quantity, tier) < item.deposit_price * item.quantity
        );
    }

    // Tóm tắt đơn cọc ở cột bên phải trang đặt hàng (contact.html)
    function renderOrderSummary() {
        if (!orderSummary) return;
        if (cart.length === 0) {
            orderSummary.innerHTML =
                '<p>Giỏ hàng đang trống. <a href="products.html">Chọn sản phẩm</a> trước khi đặt cọc.</p>';
            return;
        }
        const tier = getSelectedTier();
        const deposit = getCartDeposit(tier);
        const total = getCartTotal();
        const below = findBelowMinimum(tier);
        orderSummary.innerHTML =
            "<h2>Đơn Cọc Của Bạn</h2><ul style='list-style:none; margin-bottom: 8px;'>" +
            cart
                .map(
                    (item) =>
                        `<li style="display:flex; justify-content:space-between; gap:8px; padding: 4px 0;">
                            <span>${escapeHTML(item.name)} × ${item.quantity}</span>
                            <span>${formatVND(item.total_price * item.quantity)}</span>
                        </li>`
                )
                .join("") +
            `</ul>
            <p>Tổng giá trị: <strong>${formatVND(total)}</strong></p>
            <p class="cart-total" style="text-align:left;">Cọc đợt 1 (${tier}%): ${formatVND(deposit)}</p>
            <p>Thanh toán đợt 2 khi hàng về: <strong>${formatVND(total - deposit)}</strong></p>` +
            (below
                ? `<p style="color:#b42318; margin-top:8px;" role="alert">"${escapeHTML(below.name)}" yêu cầu cọc tối thiểu ${formatVND(below.deposit_price * below.quantity)}. Hãy chọn mức cọc cao hơn.</p>`
                : "");
    }
    if (tierSelect) tierSelect.addEventListener("change", renderOrderSummary);

    // Vẽ lại mọi nơi đang hiển thị giỏ hàng
    function refreshCartViews() {
        renderCartUI();
        renderOrderSummary();
    }

    // Bấm nút + / − / Xóa trong popup giỏ hàng
    if (cartItemsContainer) {
        cartItemsContainer.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-action]");
            if (!button) return;
            const id = Number(button.dataset.id);
            const item = cart.find((line) => line.id === id);
            if (!item) return;

            const action = button.dataset.action;
            if (action === "inc") {
                if (item.remaining_slots !== undefined && item.quantity + 1 > item.remaining_slots) {
                    showToast(`Chỉ còn ${item.remaining_slots} slot "${item.name}".`);
                    return;
                }
                if (item.quantity + 1 > 99) {
                    showToast("Mỗi mô hình chỉ đặt tối đa 99 slot một lần.");
                    return;
                }
                item.quantity += 1;
            } else if (action === "dec") {
                item.quantity -= 1;
                if (item.quantity <= 0) cart = cart.filter((line) => line.id !== id);
            } else if (action === "remove") {
                cart = cart.filter((line) => line.id !== id);
            }
            saveCart();
            refreshCartViews();
        });
    }

    function closeCartModal() {
        if (cartModal) cartModal.classList.remove("active");
    }
    // Mở popup khi bấm "Giỏ hàng", đóng khi bấm X, bấm nền mờ hoặc nhấn Esc
    if (cartIcon && cartModal) {
        cartIcon.addEventListener("click", (e) => {
            e.preventDefault();
            renderCartUI();
            cartModal.classList.add("active");
        });
        if (closeCart) closeCart.addEventListener("click", closeCartModal);
        cartModal.addEventListener("click", (e) => {
            if (e.target === cartModal) closeCartModal();
        });
        // Nhấn Esc để đóng
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeCartModal();
        });
    }

    renderOrderSummary();

    // GỬI ĐƠN ĐẶT CỌC (contact.html) -> POST /api/orders
    if (orderForm) {
        const orderResult = document.querySelector("#order-result");

        orderForm.addEventListener("submit", async function (event) {
            event.preventDefault(); // chặn form tải lại trang

            const customerName = document.querySelector("#customer-name").value.trim();
            const phone = document.querySelector("#phone").value.trim();
            const address = document.querySelector("#address").value.trim();
            const note = document.querySelector("#note").value.trim();
            const tier = getSelectedTier();

            // Kiểm tra sơ bộ ở trình duyệt cho phản hồi nhanh (server vẫn kiểm tra lại)
            if (customerName.length < 3) return showToast("Họ tên phải có ít nhất 3 ký tự.");
            if (!/^[0-9]{10}$/.test(phone)) return showToast("Số điện thoại phải gồm đúng 10 chữ số.");
            // Địa chỉ không bắt buộc lúc cọc (bổ sung khi hàng về), nhưng đã nhập thì phải đủ chi tiết
            if (address && address.length < 10) return showToast("Địa chỉ phải có ít nhất 10 ký tự chi tiết, hoặc để trống và bổ sung sau.");
            if (cart.length === 0) return showToast("Giỏ hàng đang trống. Vui lòng chọn sản phẩm trước!");
            const below = findBelowMinimum(tier);
            if (below) return showToast(`"${below.name}" cần mức cọc cao hơn ${tier}%.`);

            const submitBtn = orderForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;   // chặn bấm 2 lần

            try {
                // Chỉ gửi id + số lượng + mức cọc. Giá, slot và tiền cọc do server tự quyết định.
                const response = await fetch(`${API_BASE}/api/orders`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customerName,
                        phone,
                        address,
                        note,
                        deposit_tier: tier,
                        cart: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
                    }),
                });

                const result = await response.json();

                if (!response.ok) {
                    showToast(result.error || "Có lỗi xảy ra, vui lòng thử lại.");
                    return;
                }

                // Thành công: hiện từng đơn cọc với mã đơn và số tiền thật từ server
                if (orderResult) {
                    const lines = result.orders
                        .map((order) => {
                            const code = String(order._id).slice(-6).toUpperCase();
                            return `<li><strong>#${code}</strong> — ${escapeHTML(order.product_name)} × ${order.quantity}: cọc ${formatVND(order.deposit_amount)}, đợt 2 còn ${formatVND(order.second_payment_amount)}</li>`;
                        })
                        .join("");
                    orderResult.innerHTML = `
                        <div style="background: var(--color-surface); border: 2px solid var(--color-secondary); border-radius: var(--radius-lg); padding: var(--space-lg); margin-bottom: var(--space-lg);" role="status">
                            <h2>✅ Đã ghi nhận đơn đặt cọc!</h2>
                            <p>Cảm ơn <strong>${escapeHTML(result.orders[0].customer_name)}</strong>. Chúng tôi sẽ liên hệ qua số <strong>${escapeHTML(result.orders[0].phone_number)}</strong> để hướng dẫn chuyển khoản cọc.</p>
                            <ul style="margin: 8px 0 8px 20px;">${lines}</ul>
                            <p>Số tiền cọc đợt 1: <strong>${formatVND(result.deposit_amount)}</strong></p>
                            <p>Đợt 2 (<strong>${formatVND(result.second_payment_amount)}</strong>) thanh toán khi hàng về kho Việt Nam. Lúc đó chúng tôi sẽ nhắn bạn xác nhận địa chỉ giao hàng.</p>
                            <a href="products.html" class="btn btn-secondary" style="margin-top: 12px;">Xem thêm mô hình</a>
                        </div>`;
                    orderResult.scrollIntoView({ behavior: "smooth", block: "start" });
                }

                // Dọn form và làm trống giỏ
                orderForm.reset();
                cart = [];
                saveCart();
                refreshCartViews();
            } catch (error) {
                console.error("Lỗi khi gửi đơn đặt cọc:", error);
                showToast("Không thể kết nối tới server. Vui lòng thử lại sau.");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }


    // Nạp danh sách sản phẩm ban đầu (products.html)
    // VẼ SẢN PHẨM LẦN ĐẦU (products.html)
    // Nếu products.js đã tải xong thì vẽ ngay, chưa xong thì đợi tín hiệu "products-loaded"
    if (productList) {
        if (products.length > 0) {
            renderProducts(products);
        }
        document.addEventListener("products-loaded", () => renderProducts(products));
    }
});