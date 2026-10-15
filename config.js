// ==========================================
// CẤU HÌNH HỆ THỐNG (API KEYS & TOKENS)
// ==========================================

// 1. Cấu hình Supabase (Bắt buộc phải thay bằng key thật của dự án)
window.SUPABASE_URL =
  window.SUPABASE_URL || "https://whlwyxmergmnnapblurd.supabase.co";
window.SUPABASE_ANON_KEY =
  window.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndobHd5eG1lcmdtbm5hcGJsdXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzUwOTYsImV4cCI6MjEwNjQxMTA5Nn0.NZj5Kvh7vLXJr3G9ofc-3O5G9NDUE88hIzacWZQ8sVA";

if (!window.supabaseClient && window.supabase) {
  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
  );
}

// KHÔNG CẦN MAPBOX TOKEN NỮA
// MapLibre sử dụng nền tảng tile miễn phí
