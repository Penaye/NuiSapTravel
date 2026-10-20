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

window.GEMINI_API_KEY = window.GEMINI_API_KEY || "";
window.GEMINI_MODEL = "gemma-3-27b-it";

// Chuỗi xoay vòng tự động: Ưu tiên Gemma 3 (27B -> 12B) -> Gemma 2 (27B -> 9B) -> Gemini
window.GEMINI_FALLBACK_MODELS = [
  "gemma-3-27b-it",
  "gemma-3-12b-it",
  "gemma-2-27b-it",
  "gemma-2-9b-it",
  "gemini-3.8-flash",
];

window.USE_SUPABASE_EDGE_GEMINI = true;
