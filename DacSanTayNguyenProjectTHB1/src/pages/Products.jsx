import { useEffect, useState } from 'react'
import { getProducts } from '../api'
import ProductCard from '../components/ProductCard'

export default function Products() {
    const [products, setProducts] = useState([]) // danh sách đang hiển thị
    const [loading, setLoading] = useState(true) // đang tải?
    const [error, setError] = useState('')
    // Giá trị đang chọn ở bộ lọc (chưa gửi lên server cho tới khi bấm "Lọc sản phẩm")
    const [filters, setFilters] = useState({ search: '', category: 'all', price: 'all' })

    // Gọi API lấy sản phẩm theo bộ lọc. Việc lọc do server (products.routes.js) xử lý.
    const load = (f = filters) => {
        setLoading(true)
        getProducts(f)
            .then((data) => { setProducts(data); setError('') })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false)) // dù thành công hay lỗi đều tắt chữ "Đang tải"
    }

    // Lần đầu vào trang: tải toàn bộ sản phẩm
    useEffect(() => {
        document.title = 'Danh Sách Đặc Sản Tây Nguyên | Sản Phẩm Chất Lượng'
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Hàm tạo sẵn handler cho từng ô lọc. set('category') trả về hàm cập nhật đúng trường category.
    const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value })

    return (
        <>
            <section>
                <h1>Danh Sách Sản Phẩm Đặc Sản</h1>
                <p>Tổng hợp các nông sản và quà tặng chất lượng nhất đến từ các tỉnh Tây Nguyên.</p>
            </section>
            <div className="products-layout">
                {/* Cột bộ lọc bên trái */}
                <aside className="filter-sidebar">
                    <h2>Bộ Lọc Sản Phẩm</h2>
                    <div className="filter-group">
                        <label htmlFor="search-input">Tìm kiếm</label>
                        {/* value + onChange = "controlled input": giá trị ô nhập do React quản lý.
                Nhấn Enter cũng gọi lọc luôn. */}
                        <input id="search-input" type="text" placeholder="Nhập tên sản phẩm..." value={filters.search}
                            onChange={set('search')} onKeyDown={(e) => e.key === 'Enter' && load()} />
                    </div>
                    <div className="filter-group">
                        <label htmlFor="category-select">Danh mục</label>
                        <select id="category-select" value={filters.category} onChange={set('category')}>
                            <option value="all">Tất cả danh mục</option>
                            <option value="ca-phe">Cà phê & Ca cao</option>
                            <option value="mat-ong">Mật ong rừng</option>
                            <option value="mac-ca">Hạt dinh dưỡng</option>
                            <option value="tieu">Gia vị</option>
                            <option value="bo">Bơ sáp</option>
                            <option value="tho-cam">Thổ cẩm</option>
                            <option value="dac-san-khac">Đặc sản khác</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label htmlFor="price-select">Khoảng giá</label>
                        <select id="price-select" value={filters.price} onChange={set('price')}>
                            <option value="all">Tất cả giá</option>
                            <option value="under-150">Dưới 150.000 VNĐ</option>
                            <option value="150-300">150.000 - 300.000 VNĐ</option>
                            <option value="over-300">Trên 300.000 VNĐ</option>
                        </select>
                    </div>
                    <button type="button" className="btn" style={{ width: '100%' }} onClick={() => load()}>Lọc sản phẩm</button>
                </aside>

                {/* Lưới sản phẩm bên phải. gridColumn '1/-1' để thông báo chiếm hết chiều ngang lưới. */}
                <section className="product-grid">
                    {loading && <p style={{ gridColumn: '1/-1' }}>Đang tải...</p>}
                    {error && <p style={{ gridColumn: '1/-1' }}>{error}</p>}
                    {!loading && !error && products.length === 0 && (
                        <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20 }}>Không có sản phẩm phù hợp.</p>
                    )}
                    {products.map((p) => <ProductCard key={p.id} product={p} detailed />)}
                </section>
            </div>
        </>
    )
}