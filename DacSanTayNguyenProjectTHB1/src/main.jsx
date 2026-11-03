import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// BrowserRouter: bật tính năng chuyển trang (/products, /contact...) mà không tải lại web
import { BrowserRouter } from 'react-router-dom'
import './index.css' // nạp CSS toàn cục cho cả ứng dụng
import App from './App.jsx'
// CartProvider: "kho" giỏ hàng dùng chung cho mọi trang
import { CartProvider } from './context/CartContext.jsx'

// Gắn ứng dụng React vào thẻ <div id="root"> trong index.html
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Thứ tự bọc: Router ngoài cùng -> CartProvider -> App.
        Mọi component bên trong App đều dùng được router và giỏ hàng. */}
    <BrowserRouter>
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
)