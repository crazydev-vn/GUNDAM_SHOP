import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatVND, imgSrc } from '../utils'

export default function CartModal() {
    const { cart, total, cartOpen, setCartOpen, changeQty, removeItem } = useCart()

    // Nhấn phím Esc để đóng popup.
    // Hàm return bên trong useEffect dùng để dọn dẹp: gỡ listener khi component bị gỡ,
    // tránh đăng ký trùng nhiều lần.
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && setCartOpen(false)
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [setCartOpen])

    return (
        // Lớp nền mờ phủ toàn màn hình. Thêm class "active" thì hiện (CSS trong style.css lo phần ẩn/hiện).
        // e.target === e.currentTarget: chỉ đóng khi bấm đúng vào nền mờ,
        // bấm vào bên trong hộp giỏ hàng thì không đóng.
        <div
            className={'cart-modal-overlay' + (cartOpen ? ' active' : '')}
            onClick={(e) => e.target === e.currentTarget && setCartOpen(false)}
        >
            <div className="cart-modal">
                <div className="cart-modal-header">
                    <h2>Giỏ Hàng Của Bạn</h2>
                    <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '1.2rem' }}
                        aria-label="Đóng giỏ hàng" onClick={() => setCartOpen(false)}>&times;</button>
                </div>
                <div className="cart-modal-body">
                    {cart.length === 0 && <p>Giỏ hàng đang trống.</p>}
                    {/* Mỗi dòng trong giỏ. key giúp React nhận biết dòng nào là dòng nào khi cập nhật */}
                    {cart.map((item) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
                            <img src={imgSrc(item.image)} alt={item.name} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                            <div style={{ flexGrow: 1 }}>
                                <h4 style={{ fontSize: '0.95rem', margin: 0 }}>{item.name}</h4>
                                <p style={{ color: 'var(--color-primary)', fontWeight: 'bold', margin: 0, fontSize: '0.9rem' }}>{formatVND(item.price)}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                    {/* Nút − và +: gọi changeQty với -1 hoặc +1 */}
                                    <button className="btn btn-outline" style={{ padding: '0 8px' }} aria-label="Giảm số lượng" onClick={() => changeQty(item.id, -1)}>−</button>
                                    <span aria-live="polite">{item.quantity}</span>
                                    <button className="btn btn-outline" style={{ padding: '0 8px' }} aria-label="Tăng số lượng" onClick={() => changeQty(item.id, 1)}>+</button>
                                </div>
                            </div>
                            <button className="btn btn-outline" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => removeItem(item.id)}>Xóa</button>
                        </div>
                    ))}
                </div>
                <div className="cart-modal-footer">
                    <p className="cart-total">Tổng tiền: {formatVND(total)}</p>
                    {/* Link chuyển sang trang đặt hàng và đóng popup luôn */}
                    <Link to="/contact" className="btn btn-secondary" onClick={() => setCartOpen(false)}>Đến trang Đặt hàng</Link>
                </div>
            </div>
        </div>
    )
}