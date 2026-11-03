import { createContext, useContext, useEffect, useRef, useState } from 'react'

// Context = "kho dùng chung". Component nào cũng lấy được giỏ hàng
// mà không cần truyền props qua từng tầng.
const CartContext = createContext(null)
// Hook tiện lợi: ở component khác chỉ cần viết const { cart, addToCart } = useCart()
export const useCart = () => useContext(CartContext)

// Đọc giỏ hàng đã lưu trong trình duyệt (key "cart", giống web cũ)
function loadCart() {
    try {
        const raw = JSON.parse(localStorage.getItem('cart'))
        // Chỉ giữ các dòng hợp lệ (có id là số nguyên)
        return Array.isArray(raw) ? raw.filter((i) => i && Number.isInteger(i.id)) : []
    } catch {
        return [] // dữ liệu hỏng -> coi như giỏ trống
    }
}

export function CartProvider({ children }) {
    // useState(loadCart): React chỉ gọi loadCart() một lần lúc khởi tạo
    const [cart, setCart] = useState(loadCart)
    const [cartOpen, setCartOpen] = useState(false) // popup giỏ hàng đang mở hay đóng
    const [toast, setToast] = useState('') // nội dung thông báo nhỏ ('' = không hiện)
    const timer = useRef() // giữ bộ đếm giờ để tự tắt thông báo

    // Mỗi khi cart thay đổi -> lưu lại vào localStorage để tải lại trang vẫn còn
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cart))
    }, [cart])

    // Hiện thông báo 2,5 giây rồi tự ẩn
    const showToast = (msg) => {
        setToast(msg)
        clearTimeout(timer.current) // hủy bộ đếm cũ nếu thông báo mới tới liền
        timer.current = setTimeout(() => setToast(''), 2500)
    }

    // Thêm sản phẩm vào giỏ (cộng dồn số lượng, không vượt quá tồn kho)
    const addToCart = (product, quantity = 1) => {
        if (!product || product.stock <= 0) return showToast('Sản phẩm đã hết hàng.')
        // Số lượng sản phẩm này đang có trong giỏ (chưa có thì là 0)
        const current = cart.find((i) => i.id === product.id)?.quantity || 0
        if (current + quantity > product.stock) {
            return showToast(`Chỉ còn ${product.stock} sản phẩm "${product.name}" (bạn đã có ${current} trong giỏ).`)
        }
        // setCart(prev => ...): luôn tạo mảng mới, không sửa trực tiếp mảng cũ
        setCart((prev) => {
            const exist = prev.find((i) => i.id === product.id)
            if (exist) {
                // Đã có trong giỏ -> tăng số lượng, cập nhật lại tồn kho mới nhất
                return prev.map((i) =>
                    i.id === product.id ? { ...i, quantity: i.quantity + quantity, stock: product.stock } : i
                )
            }
            // Chưa có -> thêm dòng mới. Chỉ lưu các trường cần dùng.
            const { id, name, price, image, stock } = product
            return [...prev, { id, name, price, image, stock, quantity }]
        })
        showToast(`Đã thêm "${product.name}" vào giỏ hàng!`)
    }

    // Tăng/giảm số lượng 1 dòng. delta = +1 hoặc -1.
    const changeQty = (id, delta) => {
        const item = cart.find((i) => i.id === id)
        if (!item) return
        // Không cho tăng quá tồn kho
        if (delta > 0 && item.stock !== undefined && item.quantity + delta > item.stock) {
            return showToast(`Chỉ còn ${item.stock} sản phẩm "${item.name}".`)
        }
        setCart((prev) =>
            prev
                .map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
                .filter((i) => i.quantity > 0) // giảm về 0 thì tự xóa khỏi giỏ
        )
    }

    const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id)) // xóa 1 dòng
    const clearCart = () => setCart([]) // làm trống giỏ (sau khi đặt hàng xong)

    // Tổng số món và tổng tiền, tính lại mỗi lần cart đổi
    const count = cart.reduce((s, i) => s + i.quantity, 0)
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)

    return (
        // value = mọi thứ mà các component con được phép dùng
        <CartContext.Provider
            value={{ cart, count, total, addToCart, changeQty, removeItem, clearCart, cartOpen, setCartOpen, showToast }}
        >
            {children}
            {/* Chỉ vẽ thông báo khi toast có nội dung */}
            {toast && <div className="toast" role="status">{toast}</div>}
        </CartContext.Provider>
    )
}