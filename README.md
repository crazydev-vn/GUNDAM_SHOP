npm run seed:reset-all   # nạp 6 mô hình pre-order (chỉ cần 1 lần)
npm run dev              # terminal 1
npm run test:api         # terminal 2
------------------------------------------------------------------------------------------------------------------------------------------
$base = "http://localhost:3000"
$key  = "MA_ADMIN"        # đổi thành ADMIN_KEY trong file .env

# Gửi request. Thêm -admin để kèm khóa quản trị. Lỗi sẽ in ra dạng "HTTP 400: nội dung lỗi".
function Call($method, $path, $body = $null, [switch]$admin) {
    $params = @{ Uri = "$base$path"; Method = $method; ContentType = "application/json; charset=utf-8" }
    if ($admin) { $params.Headers = @{ "x-admin-key" = $key } }
    if ($body) { $params.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 8)) }
    try { Invoke-RestMethod @params }
    catch {
        $msg = $_.ErrorDetails.Message
        try { $msg = ($msg | ConvertFrom-Json).error } catch {}
        if ($_.Exception.Response) { Write-Host ("  -> HTTP " + $_.Exception.Response.StatusCode.value__ + ": " + $msg) -ForegroundColor Yellow }
        else { Write-Host ("  -> Không kết nối được server: " + $_.Exception.Message) -ForegroundColor Red }
    }
}
# Xem đầy đủ kết quả dạng JSON
function Show($x) { $x | ConvertTo-Json -Depth 8 }
------------------------------------------------------------------------------------------------------------------------------------------
1. Kiểm tra server

Show (Call GET /api/health)                 # status: ok
Call GET /api/khong-ton-tai                 # HTTP 404: API không tồn tại
------------------------------------------------------------------------------------------------------------------------------------------
2. Xem sản phẩm (công khai)

(Call GET /api/products).Count                         # 6
Show (Call GET /api/products/1)                        # chi tiết HG RX-78-2, có po_status
(Call GET "/api/products?category=mg").name            # 2 sản phẩm MG
(Call GET "/api/products?price=under-500").name        # HG, SD
(Call GET "/api/products?price=500-2000").name         # RG, MG
(Call GET "/api/products?price=over-2000").name        # PG, MGEX
(Call GET "/api/products?search=unicorn").name         # PG, MGEX
(Call GET "/api/products?featured=true").Count         # 6
(Call GET "/api/products?sort=price_desc").name        # đắt nhất lên đầu
(Call GET "/api/products?sort=cut_off_asc").name       # sắp hết hạn cọc lên đầu
Show (Call GET "/api/products?page=1&limit=2")         # { data, page, limit, total, totalPages }
Call GET /api/products/999                             # HTTP 404
Call GET /api/products/abc                             # HTTP 400
------------------------------------------------------------------------------------------------------------------------------------------
3. Thêm / sửa sản phẩm (admin)

$p = Call POST /api/products @{
  name="TEST Gundam"; category="hg"; deposit_price=50000; total_price=100000; total_slots=5
  cut_off_date=(Get-Date).AddDays(30).ToString("yyyy-MM-dd") + "T23:59:59+07:00"
  release_quarter_year="Q4/2027"; variants_bonus=@("Quà test")
  image="images/gundam1.png"; description="Sản phẩm test"
} -admin
$prodId = $p.id
"id=$prodId status=$($p.po_status) slots=$($p.remaining_slots)"     # status=Open slots=5

- Các trường hợp lỗi: 

Call POST /api/products @{ name="X" }                                  # HTTP 401 (thiếu -admin)
Call POST /api/products @{ name="TEST 2"; category="xyz" } -admin      # HTTP 400 danh mục sai
Call POST /api/products @{ name="TEST 2"; category="hg"; total_price=100000; deposit_price=999999 } -admin   # HTTP 400 giá cọc > giá tổng

- Sửa sản phẩm:

(Call PUT "/api/products/$prodId" @{ po_status="Closed" } -admin).po_status   # Closed
(Call PUT "/api/products/$prodId" @{ po_status="Open" } -admin).po_status     # Open
Call PUT "/api/products/$prodId" @{ remaining_slots=99 } -admin               # HTTP 400 vượt total_slots
Call PUT "/api/products/$prodId" @{ foo=1 } -admin                            # HTTP 400 không có trường nào
Call PUT /api/products/999 @{ name="xx" } -admin                              # HTTP 404
------------------------------------------------------------------------------------------------------------------------------------------
4. Đặt cọc (khách)
- Dữ liệu sai trước:

$order = @{ customerName="Nguyen Van Test"; phone="0912345678"; address=""; note="Test"; deposit_tier=50; cart=@(@{id=$prodId; quantity=2}) }
function BadOrder($field, $value) { $b = $order.Clone(); $b[$field] = $value; Call POST /api/orders $b }

BadOrder cart @()                                   # HTTP 400 giỏ trống
BadOrder phone "123"                                # HTTP 400 số điện thoại
BadOrder customerName "A"                           # HTTP 400 họ tên ngắn
BadOrder address "abc"                              # HTTP 400 địa chỉ nhập dở
BadOrder deposit_tier 20                            # HTTP 400 mức cọc không hợp lệ
BadOrder deposit_tier 30                            # HTTP 400 cọc thấp hơn mức tối thiểu của sản phẩm
BadOrder cart @(@{id=$prodId; quantity=6})          # HTTP 400 vượt 5 slot
BadOrder cart @(@{id=999999; quantity=1})           # HTTP 400 sản phẩm không tồn tại
(Call GET "/api/products/$prodId").remaining_slots  # vẫn 5 (đặt lỗi không mất slot)

- Đặt thành công:

$r = Call POST /api/orders $order
$a = $r.orders[0]
$codeA = $a._id.Substring($a._id.Length-6).ToUpper()
"deposit=$($a.deposit_amount) second=$($a.second_payment_amount) status=$($a.order_status) code=$codeA"
# deposit=100000 second=100000 status=Pending_Deposit
Show $r                                             # có thêm total_price, deposit_amount, second_payment_amount

$orderB = $order.Clone(); $orderB.deposit_tier = 100; $orderB.address = "123 Duong Test, Quan 1, TP.HCM"; $orderB.cart = @(@{id=$prodId; quantity=1})
$b = (Call POST /api/orders $orderB).orders[0]
"second=$($b.second_payment_amount)"                # 0 (thanh toán 100%)
(Call GET "/api/products/$prodId").remaining_slots  # 2
------------------------------------------------------------------------------------------------------------------------------------------
5. Khách tra cứu và bổ sung địa chỉ.

$phone = "0912345678"
Show (Call POST /api/orders/lookup @{phone=$phone; code=$codeA})                  # thông tin đơn, can_edit_address=true
Call POST /api/orders/lookup @{phone=$phone; code="ZZZZZZ"}                       # HTTP 404 sai mã
Call POST /api/orders/lookup @{phone="0999999999"; code=$codeA}                   # HTTP 404 sai số điện thoại
Call POST /api/orders/address @{phone=$phone; code=$codeA; shipping_address="abc"}   # HTTP 400 quá ngắn
(Call POST /api/orders/address @{phone=$phone; code=$codeA; shipping_address="123 Duong Test, Quan 1, TP.HCM"}).shipping_address
------------------------------------------------------------------------------------------------------------------------------------------
6. Hết slot, đóng PO, hoàn slot.

$oc = $order.Clone(); $oc.deposit_tier = 100; $oc.cart = @(@{id=$prodId; quantity=2})
$c = (Call POST /api/orders $oc).orders[0]
$pp = Call GET "/api/products/$prodId"; "slots=$($pp.remaining_slots) status=$($pp.po_status)"   # slots=0 status=Closed
BadOrder cart @(@{id=$prodId; quantity=1})                                                        # HTTP 400 đã đóng cọc hoặc hết slot
(Call PATCH "/api/orders/$($c._id)/status" @{order_status="Forfeited"} -admin).order_status       # Forfeited
$pp = Call GET "/api/products/$prodId"; "slots=$($pp.remaining_slots) status=$($pp.po_status)"   # slots=2 status=Open (slot được hoàn)
------------------------------------------------------------------------------------------------------------------------------------------
7. Admin quản lý đơn.

(Call GET /api/orders -admin).Count                         # 3 đơn
Call GET /api/orders                                        # HTTP 401
Call GET "/api/orders?order_status=Xyz" -admin              # HTTP 400
(Call GET "/api/orders?product_id=$prodId" -admin).Count    # 3
(Call GET "/api/orders?order_status=Deposited" -admin).Count

Call PATCH "/api/orders/$($a._id)/status" @{order_status="Xyz"} -admin     # HTTP 400 trạng thái sai
Call PATCH "/api/orders/$($a._id)/status" @{} -admin                       # HTTP 400 thiếu nội dung
Call PATCH "/api/orders/abc/status" @{order_status="Deposited"} -admin     # HTTP 400 mã sai định dạng
(Call PATCH "/api/orders/$($a._id)/status" @{order_status="Deposited"} -admin).order_status   # Deposited
(Call PATCH "/api/orders/$($b._id)/status" @{order_status="Deposited"} -admin).order_status   # Deposited

- Thử luật “Ready_To_Ship cần có địa chỉ” bằng đơn mới không có địa chỉ:

$od = $order.Clone(); $od.deposit_tier = 100; $od.cart = @(@{id=$prodId; quantity=1})
$d = (Call POST /api/orders $od).orders[0]
Call PATCH "/api/orders/$($d._id)/status" @{order_status="Deposited"} -admin | Out-Null
Call PATCH "/api/orders/$($d._id)/status" @{order_status="Ready_To_Ship"} -admin    # HTTP 400 chưa có địa chỉ
(Call PATCH "/api/orders/$($d._id)/status" @{shipping_address="456 Duong Khac, Quan 3, TP.HCM"} -admin).shipping_address
(Call PATCH "/api/orders/$($d._id)/status" @{order_status="Ready_To_Ship"} -admin).order_status   # Ready_To_Ship
------------------------------------------------------------------------------------------------------------------------------------------
8. Lô hàng (admin)
- Cần đơn $a và $b đang ở trạng thái Deposited (đã làm ở mục 7).

Call POST /api/shipments @{tracking_code="JP-TEST-001"; associated_orders=@($a._id)}                  # HTTP 401
Call POST /api/shipments @{tracking_code="JP-TEST-001"; associated_orders=@($c._id)} -admin           # HTTP 400 đơn Forfeited
Call POST /api/shipments @{tracking_code="JP-TEST-001"; associated_orders=@("abc")} -admin            # HTTP 400 mã sai
$s = Call POST /api/shipments @{tracking_code="JP-TEST-001"; associated_orders=@($a._id, $b._id)} -admin
$batchId = $s.batch_id; "batch=$batchId $($s.batch_status)"                                           # In_Transit
Call POST /api/shipments @{tracking_code="JP-TEST-002"; associated_orders=@($a._id)} -admin           # HTTP 409 đơn đã có lô
Show (Call GET /api/shipments -admin)

Call PATCH "/api/shipments/$batchId/status" @{batch_status="Xyz"} -admin                              # HTTP 400
(Call PATCH "/api/shipments/$batchId/status" @{batch_status="Arrived_VN_Warehouse"} -admin).orders_moved_to_waiting_for_address   # 2
(Call POST /api/orders/lookup @{phone=$phone; code=$codeA}).order_status                              # Waiting_For_Address
Call PATCH "/api/shipments/$batchId/status" @{batch_status="In_Transit"} -admin                       # HTTP 400 không quay lại
------------------------------------------------------------------------------------------------------------------------------------------
9. Hoàn tất đơn.

(Call PATCH "/api/orders/$($a._id)/status" @{order_status="Ready_To_Ship"} -admin).order_status   # Ready_To_Ship
(Call PATCH "/api/orders/$($a._id)/status" @{order_status="Completed"} -admin).order_status       # Completed
Call PATCH "/api/orders/$($a._id)/status" @{order_status="Waiting_For_Address"} -admin            # HTTP 400 đã ở trạng thái cuối
Call POST /api/orders/address @{phone=$phone; code=$codeA; shipping_address="999 Duong Moi, Quan 5, TP.HCM"}   # HTTP 400 không sửa được nữa