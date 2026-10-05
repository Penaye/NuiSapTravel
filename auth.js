document.addEventListener("DOMContentLoaded", async () => {
  // Lấy instance Supabase từ config.js
  const supabase = window.supabaseClient;

  // KHI VỪA VÀO, NẾU ĐÃ LOGIN THÌ CHUYỂN THẲNG RA BẢN ĐỒ
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    window.location.href = "main.html";
    return;
  }

  // LOGIC CHUYỂN TAB (ĐĂNG NHẬP / ĐĂNG KÝ)
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const authMsg = document.getElementById("auth-msg");

  function switchTab(tab) {
    authMsg.textContent = "";
    if (tab === "login") {
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      formLogin.classList.add("active");
      formRegister.classList.remove("active");
    } else {
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      formRegister.classList.add("active");
      formLogin.classList.remove("active");
    }
  }

  tabLogin.addEventListener("click", () => switchTab("login"));
  tabRegister.addEventListener("click", () => switchTab("register"));

  // LOGIC ĐĂNG NHẬP
  document.getElementById("btn-login").addEventListener("click", async (e) => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    e.target.textContent = "Đang xử lý...";

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      authMsg.className = "msg error";
      authMsg.textContent = error.message;
      e.target.textContent = "Đăng nhập";
    } else {
      authMsg.className = "msg success";
      authMsg.textContent = "Đăng nhập thành công!";
      window.location.href = "main.html"; // Trở về bản đồ
    }
  });

  // LOGIC ĐĂNG KÝ
  document
    .getElementById("btn-register")
    .addEventListener("click", async (e) => {
      const fullName = document.getElementById("reg-name").value;
      const email = document.getElementById("reg-email").value;
      const password = document.getElementById("reg-password").value;

      if (!fullName || !email || !password) {
        authMsg.className = "msg error";
        authMsg.textContent = "Vui lòng nhập đủ thông tin!";
        return;
      }

      e.target.textContent = "Đang tạo...";

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (error) {
        authMsg.className = "msg error";
        authMsg.textContent = error.message;
        e.target.textContent = "Tạo tài khoản";
      } else {
        authMsg.className = "msg success";
        authMsg.textContent = "Đăng ký thành công! Đang chuyển hướng...";
        setTimeout(() => {
          window.location.href = "main.html";
        }, 1500);
      }
    });
});
