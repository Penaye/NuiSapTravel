# NUISAP MAP - PROJECT CONTEXT

## 1. Kiến trúc hệ thống (Architecture)

- **Kiểu ứng dụng:** Client-Side Rendering (CSR) + Backend-as-a-Service (Supabase).
- **Mô hình xác thực:** JWT Token do Supabase Auth quản lý, lưu trữ tại Local Storage. Trạng thái Auth được kiểm tra ở cấp độ Global (`checkGlobalAuth`).
- **Mô hình Dữ liệu Bản đồ:** Dữ liệu tải từ bảng `locations`, chuyển đổi thành `GeoJSON FeatureCollection` để feed vào Mapbox Source. Tính năng Cluster hiện đang tắt để hỗ trợ custom icon và hover effect.
- **Offline Strategy:** Service Worker (`sw.js`) cache toàn bộ HTML/CSS/JS/Icons. Data API (Supabase) được cache thủ công bằng `localStorage` tại file `script.js`.

## 2. Cấu trúc Database (Supabase PostgreSQL)

### Bảng `profiles` (Mở rộng từ auth.users)

- `id` (UUID - PK)
- `full_name` (Text)
- `avatar_url` (Text)
- `role` (Text): `admin` (Toàn quyền), `manager` (Chủ quản), `user` (Khách).

### Bảng `categories`

- `id` (Int - PK): 1 (Du lịch), 2 (Quán ăn), 3 (Khách sạn).
- `name` (Text).

### Bảng `locations`

- `id` (Int - PK)
- `owner_id` (UUID - FK -> profiles)
- `category_id` (Int - FK -> categories)
- `name`, `description`, `image_url` (Text)
- `lat`, `lng` (Float)
- `status` (Text): `active` (Đã duyệt), `pending` (Chờ duyệt).

### Bảng `reviews`

- `id` (Int - PK)
- `location_id` (Int - FK -> locations)
- `user_id` (UUID - FK -> profiles)
- `guest_name`, `comment`, `image_url` (Text)
- `rating` (Int)

### Bảng `user_bookmarks`

- `id` (Int - PK)
- `user_id` (UUID - FK -> profiles)
- `location_id` (Int - FK -> locations)

## 3. Storage Buckets

- `location-images` (Public): Chứa ảnh địa điểm.
- `review-images` (Public): Chứa ảnh do khách upload khi review.
- `avatars` (Public): Chứa ảnh đại diện của user.

## 4. Tình trạng hiện tại (Current Status)

- [x] Bản đồ tương tác, định vị, chỉ đường, đổi style vệ tinh.
- [x] Lọc, tìm kiếm, lưu bookmark, đánh giá kèm hình ảnh.
- [x] Đăng ký / Đăng nhập, Trang cá nhân.
- [x] Dashboard quản trị (Thống kê Chart.js, Duyệt điểm, Phân quyền).
- [x] PWA (Cài đặt app, Offline Mode).
- **[!] Vấn đề tồn đọng:** Chưa cấu hình Row Level Security (RLS) chặt chẽ trên Database; UI thông báo vẫn dùng `alert()`.

## 5. Kế hoạch tiếp theo (Next Plans)

1. **Phase 0 (Perfect Foundation):** Áp dụng RLS Supabase cho toàn bộ bảng. Chuẩn hóa Custom Toast thay cho `alert()`.
2. **Phase 1 (B2B Commercialization):**
   - Thêm cột `is_sponsored`, `phone`, `website` vào `locations`.
   - Giới hạn quyền `manager` trên Dashboard (Chỉ xem/sửa địa điểm của mình).
   - Đổi style Mapbox cho các điểm Sponsored.
