import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProducts } from '../api'
import ProductCard from '../components/ProductCard'

export default function Home() {
    const [products, setProducts] = useState([]) // danh sách sản phẩm lấy từ API
    const [error, setError] = useState('') // thông báo lỗi nếu gọi API thất bại

    // useEffect với [] ở cuối: chỉ chạy 1 lần khi trang vừa mở
    useEffect(() => {
        document.title = 'Đặc Sản Tây Nguyên | Tinh Hoa Núi Rừng Việt Nam' // tiêu đề tab trình duyệt
        getProducts().then(setProducts).catch((e) => setError(e.message))
    }, [])

    // Ưu tiên sản phẩm có featured = true (cột "nổi bật" trong DB).
    // Nếu chưa có cái nào được đánh dấu thì lấy tạm các sản phẩm đầu. Tối đa 6 sản phẩm.
    const featured = products.filter((p) => p.featured)
    const list = (featured.length ? featured : products).slice(0, 6)

    return (
        <>
            <section className="hero">
                <h2>Khám Phá Đặc Sản Tây Nguyên</h2>
                <p>Thưởng thức trọn vẹn hương vị tự nhiên, nguyên bản đến từ vùng đất đỏ bazan mỡ màng và đầy nắng gió.</p>
                <Link to="/products" className="btn btn-secondary" style={{ marginTop: 'var(--space-md)' }}>Xem sản phẩm ngay</Link>
            </section>
            <section>
                <h2>Sản Phẩm Nổi Bật</h2>
                {error && <p>{error}</p>}
                <div className="product-grid">
                    {/* Mỗi sản phẩm vẽ thành 1 thẻ gọn */}
                    {list.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
            </section>
        </>
    )
}