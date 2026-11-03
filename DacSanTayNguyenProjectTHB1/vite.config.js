// defineConfig: hàm giúp editor gợi ý đúng các tùy chọn cấu hình của Vite
import { defineConfig } from 'vite'
// Plugin cho phép Vite hiểu cú pháp JSX của React
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy: khi trình duyệt gọi các đường dẫn bên dưới tới Vite (cổng 5173),
    // Vite sẽ tự chuyển tiếp sang backend Express (cổng 3000).
    // Nhờ vậy React chỉ cần gọi '/api/products', không cần ghi đầy đủ địa chỉ
    // và cũng không bị lỗi CORS.
    proxy: {
      '/api': 'http://localhost:3000',
      '/images': 'http://localhost:3000', // ảnh nằm trong public/images của backend
    },
  },
})