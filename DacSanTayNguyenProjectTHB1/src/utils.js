// Đổi số thành giá tiền kiểu Việt Nam. Vd: 150000 -> "150.000 đ"
export const formatVND = (n) => Number(n).toLocaleString('vi-VN') + ' đ'

// Ảnh trong DB có dạng "images/xxx.jpg" (đường dẫn tương đối).
// Ở trang /product/1 trình duyệt sẽ hiểu thành /product/images/xxx.jpg và không thấy ảnh,
// nên thêm "/" ở đầu để luôn trỏ về /images/xxx.jpg.
// Nếu đã là link đầy đủ (http...) hoặc đã có "/" ở đầu thì giữ nguyên.
export const imgSrc = (p) => (!p || /^(https?:|\/)/.test(p) ? p : '/' + p)

// Bảng đổi mã danh mục (lưu trong DB) sang tên hiển thị cho khách xem
export const CATEGORY_LABELS = {
    'ca-phe': 'Cà phê & Ca cao',
    'mat-ong': 'Mật ong rừng',
    'mac-ca': 'Hạt dinh dưỡng',
    tieu: 'Gia vị',
    bo: 'Bơ sáp',
    'tho-cam': 'Thổ cẩm',
    'dac-san-khac': 'Đặc sản khác',
}