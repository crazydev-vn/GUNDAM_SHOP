import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createOrder } from '../api'
import { useCart } from '../context/CartContext'
import { formatVND } from '../utils'

export default function Contact() {
    const { cart, total, clearCart, showToast } = useCart()
    // Toàn bộ dữ liệu form gom vào 1 object
    const [form, setForm] = useState({ customerName: '', phone: '', address: '', note: '' })
    const [submitting, setSubmitting] = useState(false) // đang gửi? (để khóa nút, chặn bấm 2 lần)
    const [result, setResult] = useState(null) // đơn hàng server trả về sau khi đặt thành công

    useEffect(() => { document.title = 'Liên Hệ & Đặt Hàng | Đặc Sản Tây Nguyên' }, [])

    // Tạo handler cho từng ô nhập: set('phone') -> cập nhật đúng trường phone
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

    const onSubmit = async (e) => {
        e.preventDefault() // chặn form tải lại trang

        const customerName = form.customerName.trim()
        const phone = form.phone.trim()
        const address = form.address.trim()

        // Kiểm tra sơ bộ ở trình duyệt cho phản hồi nhanh (server vẫn kiểm tra lại bằng luật y hệt)
        if (customerName.length < 3) return showToast('Họ tên phải có ít nhất 3 ký tự.')
        if (!/^[0-9]{10}$/.test(phone)) return showToast('Số điện thoại phải gồm đúng 10 chữ số.')
        if (address.length < 10) return showToast('Địa chỉ nhận hàng phải có ít nhất 10 ký tự chi tiết.')
        if (cart.length === 0) return showToast('Giỏ hàng đang trống. Vui lòng chọn sản phẩm trước!')

        setSubmitting(true)
        try {
            // Chỉ gửi id + số lượng. Tên và giá do server tự lấy từ database,
            // nên khách không thể sửa giá để mua rẻ.
            const order = await createOrder({
                customerName, phone, address, note: form.note.trim(),
                cart: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
            })
            setResult(order) // hiện khung "Đặt hàng thành công"
            setForm({ customerName: '', phone: '', address: '', note: '' }) // xóa trắng form
            clearCart() // làm trống giỏ
            window.scrollTo({ top: 0, behavior: 'smooth' }) // cuộn lên để khách thấy khung xác nhận
        } catch (err) {
            // Lỗi từ server (hết hàng, dữ liệu sai...) hoặc mất kết nối
            showToast(err.message || 'Không thể kết nối tới server. Vui lòng thử lại sau.')
        } finally {
            setSubmitting(false) // luôn mở lại nút dù thành công hay lỗi
        }
    }

    return (
        <>
            <section>
                <h1>Thông Tin Đặt Hàng</h1>
                <p>Vui lòng điền thông tin bên dưới để chúng tôi giao hàng đến cho bạn.</p>
            </section>

            {/* Khung xác nhận: chỉ hiện khi result có dữ liệu (đã đặt thành công).
          Mã đơn = 6 ký tự cuối của _id MongoDB, viết hoa. Tổng tiền là số server tự tính. */}
            {result && (
                <div role="status" style={{ background: 'var(--color-surface)', border: '2px solid var(--color-secondary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                    <h2>✅ Đặt hàng thành công!</h2>
                    <p>Cảm ơn <strong>{result.customerName}</strong>. Chúng tôi sẽ liên hệ qua số <strong>{result.phone}</strong> để xác nhận đơn.</p>
                    <p>Mã đơn hàng: <strong>#{String(result._id).slice(-6).toUpperCase()}</strong></p>
                    <p>Tổng thanh toán: <strong>{formatVND(result.totalPrice)}</strong></p>
                    <Link to="/products" className="btn btn-secondary" style={{ marginTop: 12 }}>Tiếp tục mua sắm</Link>
                </div>
            )}

            <div className="products-layout">
                {/* Form đặt hàng. onSubmit chạy khi bấm nút gửi hoặc nhấn Enter. */}
                <form className="contact-form" onSubmit={onSubmit}>
                    <div className="form-group">
                        <label htmlFor="customer-name">Họ tên khách hàng</label>
                        <input id="customer-name" type="text" placeholder="Nguyễn Văn A" autoComplete="name" required
                            value={form.customerName} onChange={set('customerName')} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="phone">Số điện thoại</label>
                        <input id="phone" type="tel" placeholder="0900000000" inputMode="numeric" maxLength={10}
                            autoComplete="tel" required value={form.phone} onChange={set('phone')} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="address">Địa chỉ nhận hàng</label>
                        <input id="address" type="text" placeholder="Nhập chi tiết số nhà, tên đường..."
                            autoComplete="street-address" required value={form.address} onChange={set('address')} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="note">Ghi chú đơn hàng</label>
                        <textarea id="note" rows={5} placeholder="Ghi chú thêm..." value={form.note} onChange={set('note')} />
                    </div>
                    {/* Khi đang gửi thì khóa nút và đổi chữ */}
                    <button type="submit" className="btn" disabled={submitting}>
                        {submitting ? 'Đang gửi...' : 'Gửi đơn hàng'}
                    </button>
                </form>

                {/* Cột bên phải: tóm tắt giỏ hàng + thông tin cửa hàng */}
                <aside className="filter-sidebar">
                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                        {cart.length === 0 ? (
                            <p>Giỏ hàng đang trống. <Link to="/products">Chọn sản phẩm</Link> trước khi đặt hàng.</p>
                        ) : (
                            <>
                                <h2>Đơn Hàng Của Bạn</h2>
                                <ul style={{ listStyle: 'none', marginBottom: 8 }}>
                                    {cart.map((i) => (
                                        <li key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                                            <span>{i.name} × {i.quantity}</span>
                                            <span>{formatVND(i.price * i.quantity)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="cart-total">Tổng tiền: {formatVND(total)}</p>
                            </>
                        )}
                    </div>
                    <h2>Thông Tin Bổ Sung</h2>
                    <p><strong>Địa chỉ kho:</strong> TP. Buôn Ma Thuột, Đắk Lắk</p>
                    <p><strong>Hotline:</strong> 0900 000 000</p>
                    <p><strong>Email:</strong> lienhe@dacsantaynguyen.vn</p>
                </aside>
            </div>
        </>
    )
}