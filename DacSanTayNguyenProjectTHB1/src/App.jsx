import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import CartModal from './components/CartModal'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Contact from './pages/Contact'

// App = khung chung của web: Header (trên) + nội dung từng trang (giữa) + Footer (dưới).
// Header, Footer và CartModal luôn hiện, chỉ phần giữa đổi theo đường dẫn.
export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        {/* Routes: so đường dẫn trên thanh địa chỉ với từng Route để chọn trang hiển thị */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          {/* ":id" là phần thay đổi, vd /product/3 -> id = "3" (ProductDetail đọc bằng useParams) */}
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/contact" element={<Contact />} />
          {/* "*" = mọi đường dẫn còn lại (gõ sai) -> về trang chủ, giống fallback trong server.js */}
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
      {/* Popup giỏ hàng: luôn nằm trong trang, bật/tắt bằng class "active" */}
      <CartModal />
    </>
  )
}