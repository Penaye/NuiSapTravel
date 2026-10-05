# 🗺️ Bản đồ Du lịch Núi Sập (PWA Web GIS)

Hệ thống bản đồ tương tác cung cấp thông tin các địa điểm du lịch, nhà hàng, khách sạn tại khu vực Núi Sập, An Giang. Dự án được xây dựng dưới dạng Progressive Web App (PWA), hỗ trợ hoạt động ngoại tuyến (Offline Caching) và tích hợp hệ thống quản trị nội dung (CMS) theo thời gian thực.

## 🚀 Tech Stack

- **Frontend Core:** HTML5, CSS3, Vanilla JavaScript (ES6+).
- **Bản đồ (Web GIS):** Mapbox GL JS (Chế độ đường phố & Vệ tinh 3D).
- **Backend as a Service (BaaS):** Supabase (PostgreSQL, Auth, Storage).
- **Biểu đồ Analytics:** Chart.js.
- **Tính năng nổi bật:** PWA (Service Worker, Manifest), Offline LocalStorage.

## 📁 Cấu trúc thư mục hiện tại

├── index.html / main.html # Giao diện bản đồ chính (Dành cho Khách/User)
├── style.css # Styling cho giao diện bản đồ
├── script.js # Logic bản đồ, tìm kiếm, lọc, đánh giá, offline cache
├── dashboard.html # Giao diện Quản trị hệ thống
├── dashboard.css # Styling cho Dashboard
├── dashboard.js # Khởi tạo Dashboard, Phân quyền Admin/Manager/User
├── dashboardLocations.js # Module Quản lý/Thêm/Sửa/Xóa địa điểm
├── dashboardMap.js # Module Mini-map chọn tọa độ trên Dashboard
├── dashboardReviews.js # Module Quản lý đánh giá
├── dashboardUsers.js # Module Duyệt địa điểm chờ & Phân quyền user
├── dashboardAnalytics.js # Module vẽ biểu đồ thống kê
├── profile.html / .js # Trang cá nhân quản lý avatar, tên, đánh giá của User
├── auth.html / .js # Đăng nhập / Đăng ký qua Supabase Auth
├── config.js # Khởi tạo Supabase Client (Dùng chung)
├── sw.js # Service Worker (Cấu hình PWA & Cache)
├── manifest.json # Metadata cho PWA (Add to Home Screen)
└── icon-192x192.png / 512... # Các icon dùng cho PWA
