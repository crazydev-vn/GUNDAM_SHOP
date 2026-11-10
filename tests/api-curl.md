
# Lệnh curl thử API thủ công

Server chạy bằng `npm run dev`. Trên **Windows PowerShell** hãy gõ `curl.exe` (không phải `curl`,
vì `curl` trong PowerShell là lệnh khác). Thay `MA_ADMIN` bằng ADMIN_KEY trong `.env`.

## Công khai
```
curl.exe http://localhost:3000/api/health
curl.exe http://localhost:3000/api/products
curl.exe "http://localhost:3000/api/products?category=mg&price=500-2000&sort=cut_off_asc"
curl.exe http://localhost:3000/api/products/1
```

## Đặt cọc và tra cứu (khách)
PowerShell không dùng được dấu nháy đơn quanh JSON, hãy lưu JSON vào file rồi gửi bằng `-d "@file.json"`.
```
# order.json
{"customerName":"Nguyen Van A","phone":"0912345678","address":"","note":"","deposit_tier":30,"cart":[{"id":1,"quantity":1}]}

curl.exe -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d "@order.json"

# lookup.json  ->  {"phone":"0912345678","code":"A1B2C3"}
curl.exe -X POST http://localhost:3000/api/orders/lookup -H "Content-Type: application/json" -d "@lookup.json"
```

## Quản trị (cần header x-admin-key)
```
curl.exe http://localhost:3000/api/orders -H "x-admin-key: MA_ADMIN"
curl.exe "http://localhost:3000/api/orders?order_status=Deposited" -H "x-admin-key: MA_ADMIN"
curl.exe http://localhost:3000/api/shipments -H "x-admin-key: MA_ADMIN"

# đổi trạng thái đơn (status.json -> {"order_status":"Deposited"})
curl.exe -X PATCH http://localhost:3000/api/orders/ID_DON/status -H "Content-Type: application/json" -H "x-admin-key: MA_ADMIN" -d "@status.json"

# lô về kho (arrive.json -> {"batch_status":"Arrived_VN_Warehouse"})
curl.exe -X PATCH http://localhost:3000/api/shipments/1/status -H "Content-Type: application/json" -H "x-admin-key: MA_ADMIN" -d "@arrive.json"
```
Trên macOS/Linux/Git Bash có thể viết JSON trực tiếp: `-d '{"order_status":"Deposited"}'`.