// NavLink giống <a> nhưng không tải lại trang, và tự biết link nào đang được chọn
import { NavLink } from 'react-router-dom'
import { useCart } from '../context/CartContext'

export default function Header() {
    const { count, setCartOpen } = useCart() // count: số món trong giỏ; setCartOpen: mở/đóng popup
    // NavLink truyền isActive = true khi đường dẫn khớp -> thêm class "active" để tô đậm menu
    const cls = ({ isActive }) => (isActive ? 'active' : '')
    return (
        <header>
            <div className="container header-container">
                <div className="brand">
                    <h1 className="brand-title">Đặc Sản Tây Nguyên</h1>
                </div>
                <nav>
                    <ul>
                        {/* "end": chỉ coi là active khi đúng "/" tuyệt đối,
                nếu thiếu thì "Trang chủ" sẽ sáng ở mọi trang vì mọi đường dẫn đều bắt đầu bằng "/" */}
                        <li><NavLink to="/" end className={cls}>Trang chủ</NavLink></li>
                        <li><NavLink to="/products" className={cls}>Sản phẩm</NavLink></li>
                        <li><NavLink to="/contact" className={cls}>Liên hệ</NavLink></li>
                        <li>
                            {/* Bấm vào thì mở popup giỏ hàng */}
                            <button type="button" className="cart-link" onClick={() => setCartOpen(true)}>
                                Giỏ hàng ({count})
                            </button>
                        </li>
                    </ul>
                </nav>
            </div>
        </header>
    )
}