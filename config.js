// Khởi tạo Supabase client dùng chung cho toàn bộ dự án
const SUPABASE_URL = "https://whlwyxmergmnnapblurd.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndobHd5eG1lcmdtbm5hcGJsdXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzUwOTYsImV4cCI6MjEwNjQxMTA5Nn0.NZj5Kvh7vLXJr3G9ofc-3O5G9NDUE88hIzacWZQ8sVA";

if (window.supabase) {
  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
  );
} else {
  console.error("Lỗi: Chưa tải CDN của Supabase!");
}
