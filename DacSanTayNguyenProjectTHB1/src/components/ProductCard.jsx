import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatVND, imgSrc } from '../utils'

// Thẻ sản phẩm dùng lại ở nhiều nơi:
//   detailed = true : thẻ đầy đủ (trang Sản phẩm): có xuất xứ, mô tả, tồn kho, nút thêm giỏ
//   detailed = false: thẻ gọn (Trang chủ, "Sản phẩm khác"): chỉ có ảnh, tên, giá, nút xem chi tiết
export default function ProductCard({ product, detailed = false }) {
    const { addToCart } = useCart()
    const out = product.stock === 0 // hết hàng?

    return (
        <article className="product-card">
            <img src={imgSrc(product.image)} alt={product.name} />
            <div className="content">
                <h3>{product.name}</h3>
                {detailed ? (
                    <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: 4 }}>
                            Xuất xứ: {product.origin} | Quy cách: {product.unit}
                        </p>
                        <p style={{ fontSize: '0.9rem', margin: '8px 0' }}>{product.description}</p>
                        {/* Đổi màu chữ: đỏ khi hết hàng, xanh ô liu khi còn hàng */}
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: out ? '#dc2626' : 'var(--color-secondary)' }}>
                            Tình trạng: {out ? 'Hết hàng' : `Còn hàng (${product.stock})`}
                        </p>
                    </>
                ) : (
                    // Thẻ gọn: chỉ hiện mô tả nếu sản phẩm có mô tả
                    product.description && <p>{product.description}</p>
                )}
                <p className="price">{detailed ? 'Giá: ' : ''}{formatVND(product.price)}</p>
                <div className="actions">
                    {/* Link tới trang chi tiết, vd /product/3 */}
                    <Link to={`/product/${product.id}`} className="btn btn-outline btn-block" style={{ marginBottom: detailed ? 8 : 0 }}>
                        {detailed ? 'Chi tiết sản phẩm' : 'Xem chi tiết'}
                    </Link>
                    {/* Nút thêm vào giỏ chỉ có ở thẻ đầy đủ. Hết hàng thì khóa nút (disabled). */}
                    {detailed && (
                        <button className="btn btn-block" disabled={out} style={out ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                            onClick={() => addToCart(product, 1)}>
                            {out ? 'Hết hàng' : 'Thêm vào giỏ hàng'}
                        </button>
                    )}
                </div>
            </div>
        </article>
    )
}