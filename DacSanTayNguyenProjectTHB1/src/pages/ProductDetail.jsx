import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProduct, getProducts } from '../api'
import { useCart } from '../context/CartContext'
import ProductCard from '../components/ProductCard'
import { CATEGORY_LABELS, formatVND, imgSrc } from '../utils'

export default function ProductDetail() {
    const { id } = useParams() // lấy ":id" từ đường dẫn /product/:id (luôn là chuỗi)
    const { addToCart } = useCart()
    const [product, setProduct] = useState(null) // sản phẩm đang xem
    const [related, setRelated] = useState([]) // danh sách "Sản phẩm khác"
    const [quantity, setQuantity] = useState(1) // số lượng khách chọn mua
    const [status, setStatus] = useState('loading') // 3 trạng thái: loading | ok | notfound

    // Chạy lại mỗi khi id đổi (vd bấm sang "Sản phẩm khác" ngay trên trang này)
    useEffect(() => {
        setStatus('loading')
        setQuantity(1)
        window.scrollTo(0, 0) // cuộn lên đầu trang
        // Gọi 2 API cùng lúc cho nhanh: chi tiết 1 sản phẩm + toàn bộ danh sách (để chọn sản phẩm liên quan)
        Promise.all([getProduct(id), getProducts()])
            .then(([p, all]) => {
                setProduct(p)
                document.title = `${p.name} | Chi Tiết Sản Phẩm`
                // Sản phẩm khác: ưu tiên cùng danh mục, thiếu thì bổ sung loại khác, lấy 3 cái
                const others = all.filter((x) => x.id !== p.id)
                const same = others.filter((x) => x.category === p.category)
                const rest = others.filter((x) => x.category !== p.category)
                setRelated([...same, ...rest].slice(0, 3))
                setStatus('ok')
            })
            // Server trả 404 (id không tồn tại) -> hiện thông báo không tìm thấy
            .catch(() => setStatus('notfound'))
    }, [id])

    // Vẽ theo trạng thái. return sớm nên phần dưới chắc chắn đã có product.
    if (status === 'loading') return <p style={{ padding: 40 }}>Đang tải...</p>
    if (status === 'notfound')
        return (
            <p style={{ textAlign: 'center', padding: 40 }}>
                Không tìm thấy thông tin sản phẩm! <Link to="/products">Quay lại danh sách</Link>
            </p>
        )

    const inStock = product.stock > 0

    // Bấm "Thêm vào giỏ hàng": chuẩn hóa số lượng (là số nguyên, từ 1 đến tồn kho) rồi thêm
    const onAdd = () => {
        let q = parseInt(quantity, 10)
        if (!Number.isInteger(q) || q < 1) q = 1
        if (q > product.stock) q = product.stock
        setQuantity(q) // cập nhật lại ô nhập cho đúng với số thực tế đã thêm
        addToCart(product, q)
    }

    return (
        <>
            <div className="product-detail-layout">
                <div>
                    <img src={imgSrc(product.image)} alt={product.name}
                        style={{ width: '100%', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }} />
                </div>
                <div className="product-detail-info">
                    <h1>{product.name}</h1>
                    <p className="price" style={{ fontSize: '1.5rem', margin: '10px 0', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {formatVND(product.price)}
                    </p>
                    <p style={{ marginBottom: 16, lineHeight: 1.7 }}>{product.description}</p>
                    <h2>Thông số sản phẩm</h2>
                    <dl>
                        {/* CATEGORY_LABELS đổi mã "ca-phe" thành "Cà phê & Ca cao"; không có trong bảng thì hiện mã gốc */}
                        <dt>Danh mục:</dt><dd>{CATEGORY_LABELS[product.category] || product.category}</dd>
                        <dt>Xuất xứ:</dt><dd>{product.origin}</dd>
                        <dt>Quy cách:</dt><dd>{product.unit}</dd>
                        <dt>Tình trạng:</dt>
                        <dd style={{ color: inStock ? 'var(--color-secondary)' : '#dc2626', fontWeight: 600 }}>
                            {inStock ? `Còn hàng (${product.stock} sản phẩm)` : 'Hết hàng'}
                        </dd>
                    </dl>
                    {/* Chỉ hiện ô chọn số lượng khi còn hàng. max = tồn kho. */}
                    {inStock && (
                        <div className="form-group" style={{ maxWidth: 140 }}>
                            <label htmlFor="quantity-input">Số lượng</label>
                            <input id="quantity-input" type="number" min="1" max={product.stock} value={quantity}
                                onChange={(e) => setQuantity(e.target.value)} />
                        </div>
                    )}
                    <div className="action-group">
                        <button type="button" className="btn" disabled={!inStock}
                            style={inStock ? {} : { opacity: 0.6, cursor: 'not-allowed' }} onClick={onAdd}>
                            {inStock ? 'Thêm vào giỏ hàng' : 'Hết hàng'}
                        </button>
                        <Link to="/contact" className="btn btn-secondary">Liên hệ tư vấn</Link>
                    </div>
                </div>
            </div>

            <section>
                <h2>Sản Phẩm Khác</h2>
                <div className="product-grid">
                    {related.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
            </section>
        </>
    )
}