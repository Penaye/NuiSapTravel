document.addEventListener("DOMContentLoaded", async () => {
  // 1. Lấy instance Supabase từ config.js (Bảo toàn code cũ của bạn)
  const supabase = window.supabaseClient || window.supabase;

  // 2. KHI VỪA VÀO, NẾU ĐÃ LOGIN THÌ CHUYỂN THẲNG RA BẢN ĐỒ
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    window.location.href = "index.html";
    return;
  }

  // 3. LIÊN KẾT VỚI GIAO DIỆN HTML MỚI
  const emailInput = document.getElementById("email-input");
  const passwordInput = document.getElementById("password-input");
  const submitBtn = document.getElementById("login-btn");

  const btnText = submitBtn.querySelector(".btn-text");
  const btnLoader = submitBtn.querySelector(".btn-loader");
  const formTitle = document.querySelector(".form-header h2");
  const formSubtitle = document.querySelector(".form-header p");

  // Phần tử để chuyển đổi giữa Đăng nhập / Đăng ký
  const toggleWrapper = document.querySelector(".p");
  const toggleBtn = toggleWrapper.querySelector(".span");

  let isLoginMode = true; // Mặc định mở lên là Đăng nhập

  // ==========================================
  // LOGIC CHUYỂN TAB (ĐĂNG NHẬP / ĐĂNG KÝ)
  // ==========================================
  toggleBtn.addEventListener("click", () => {
    isLoginMode = !isLoginMode; // Đảo ngược trạng thái

    if (isLoginMode) {
      formTitle.textContent = "Chào mừng trở lại! 👋";
      formSubtitle.textContent = "Đăng nhập để quản lý Bản đồ Núi Sập";
      btnText.textContent = "Đăng nhập ngay";
      toggleWrapper.firstChild.textContent = "Chưa có tài khoản? ";
      toggleBtn.textContent = "Đăng ký";
    } else {
      formTitle.textContent = "Tạo tài khoản mới 🚀";
      formSubtitle.textContent = "Đăng ký để tham gia hệ thống";
      btnText.textContent = "Đăng ký ngay";
      toggleWrapper.firstChild.textContent = "Đã có tài khoản? ";
      toggleBtn.textContent = "Đăng nhập";
    }
  });

  // ==========================================
  // LOGIC XỬ LÝ KHI BẤM NÚT (SUBMIT)
  // ==========================================
  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      toast({
        title: "Lỗi",
        message: "Vui lòng nhập đủ thông tin!",
        type: "error",
        duration: 3000,
      });
      return;
    }

    // Đổi giao diện nút sang trạng thái "Đang tải"
    submitBtn.disabled = true;
    btnText.style.display = "none";
    btnLoader.style.display = "block";

    try {
      if (isLoginMode) {
        // ------------------------------------
        // CHẾ ĐỘ 1: ĐĂNG NHẬP (Code cũ của bạn)
        // ------------------------------------
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: "Thành công",
          message: "Đăng nhập thành công!",
          type: "success",
          duration: 2000,
        });
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1500);
      } else {
        // ------------------------------------
        // CHẾ ĐỘ 2: ĐĂNG KÝ (Code cũ của bạn)
        // ------------------------------------
        // Tự động lấy phần trước chữ @ của email làm Tên
        const fullName = email.split("@")[0];

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });

        if (error) throw error;

        toast({
          title: "Thành công",
          message: "Đăng ký thành công! Đang chuyển hướng...",
          type: "success",
          duration: 2000,
        });
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1500);
      }
    } catch (error) {
      // Dịch lỗi tiếng Anh của Supabase sang tiếng Việt cho thân thiện
      let errorMsg = error.message;
      if (errorMsg === "Invalid login credentials")
        errorMsg = "Tài khoản hoặc mật khẩu không đúng!";
      if (errorMsg.includes("already registered"))
        errorMsg = "Email này đã được đăng ký!";
      if (errorMsg.includes("Password should be at least"))
        errorMsg = "Mật khẩu phải có ít nhất 6 ký tự!";

      toast({
        title: "Thất bại",
        message: errorMsg,
        type: "error",
        duration: 4000,
      });
    } finally {
      // Tắt trạng thái "Đang tải", trả lại nút bình thường
      submitBtn.disabled = false;
      btnText.style.display = "block";
      btnLoader.style.display = "none";
    }
  });

  // Mẹo: Cho phép người dùng bấm phím Enter ở ô Mật khẩu để Đăng nhập luôn
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      submitBtn.click();
    }
  });
});
