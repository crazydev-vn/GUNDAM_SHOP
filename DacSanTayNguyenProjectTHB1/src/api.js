// Hàm gửi request dùng chung cho mọi API, để các hàm bên dưới không phải lặp lại code.
// Nhờ proxy trong vite.config.js nên chỉ cần gọi đường dẫn tương đối ("/api/...").
async function request(url, options) {
    const res = await fetch(url, options)
    // Server luôn trả JSON. .catch(() => ({})) đề phòng trường hợp server trả nội dung không phải JSON
    const data = await res.json().catch(() => ({}))
    // Mã trạng thái lỗi (400, 404, 500...) -> ném lỗi kèm thông báo mà server đã gửi ({ error: "..." })
    if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại.')
    return data
}

// Lấy danh sách sản phẩm. params có thể là { search, category, price }.
// Bỏ các giá trị rỗng hoặc "all" để URL gọn: /api/products?category=ca-phe
export const getProducts = (params = {}) => {
    const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v && v !== 'all')
    ).toString()
    return request('/api/products' + (qs ? '?' + qs : ''))
}

// Lấy chi tiết 1 sản phẩm theo id
export const getProduct = (id) => request('/api/products/' + id)

// Gửi đơn hàng lên server
export const createOrder = (payload) =>
    request('/api/orders', {
        method: 'POST', // main.js cũ của bạn thiếu dòng này nên fetch sẽ gửi GET
        headers: { 'Content-Type': 'application/json' }, // báo cho server biết body là JSON
        body: JSON.stringify(payload), // đổi object JS thành chuỗi JSON để gửi đi
    })