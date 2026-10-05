window.DashboardApp = {
  supabase: window.supabaseClient,
  currentUser: null,
  currentProfile: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.DashboardApp.supabase;
  const logoutBtn = document.getElementById("logout-btn");
  const currentRoleBadge = document.getElementById("current-role-badge");
  const userEmailSpan = document.getElementById("user-email");

  // 1. KIỂM TRA ĐĂNG NHẬP CHUNG
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "auth.html";
    return;
  }

  // 2. KHỞI TẠO DASHBOARD & LẤY THÔNG TIN USER
  window.DashboardApp.currentUser = session.user;
  userEmailSpan.textContent = session.user.email;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error) console.error("Lỗi truy vấn Profile:", error);

  const userRole = profile?.role || "user";

  if (userRole === "user") {
    Toast.show(
      "Bạn là User bình thường, không có quyền truy cập trang Quản trị! Vui lòng liên hệ Admin để được cấp quyền.",
    );
    window.location.href = "main.html";
    return;
  }

  window.DashboardApp.currentProfile = profile;
  applyRolePermissions(userRole);

  // 3. GỌI KHỞI CHẠY CÁC MODULE CON
  if (window.DashboardAnalytics) window.DashboardAnalytics.init();
  if (window.DashboardLocations) window.DashboardLocations.init();
  if (
    window.DashboardReviews &&
    (userRole === "admin" || userRole === "manager")
  ) {
    window.DashboardReviews.init();
  }
  if (window.DashboardUsers && userRole === "admin") {
    window.DashboardUsers.init();
  }

  // 4. XỬ LÝ LOGOUT
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "auth.html";
  });

  // 5. XỬ LÝ GIAO DIỆN RESPONSIVE MOBILE
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  function closeSidebarMobile() {
    if (!sidebar || !sidebarOverlay) return;
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");
    setTimeout(() => {
      sidebarOverlay.style.display = "none";
    }, 300);
  }

  if (mobileMenuBtn && sidebar && sidebarOverlay) {
    mobileMenuBtn.addEventListener("click", () => {
      sidebar.classList.add("open");
      sidebarOverlay.style.display = "block";
      setTimeout(() => {
        sidebarOverlay.classList.add("active");
      }, 10);
    });
    sidebarOverlay.addEventListener("click", closeSidebarMobile);
  }

  // 6. ĐIỀU HƯỚNG TABS
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-item")
        .forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
      document.getElementById("page-title").textContent =
        item.textContent.trim();

      const targetId = item.getAttribute("data-target");
      document.querySelectorAll(".view-section").forEach((section) => {
        section.classList.remove("active");
        if (section.id === `view-${targetId}`) {
          section.classList.add("active");
          // Nếu chuyển về tab Tổng quan, tải lại dữ liệu biểu đồ
          if (targetId === "overview" && window.DashboardAnalytics) {
            window.DashboardAnalytics.init();
          }
        }
      });

      if (window.innerWidth <= 768) {
        closeSidebarMobile();
      }
    });
  });

  // 7. PHÂN QUYỀN GIAO DIỆN
  function applyRolePermissions(role) {
    currentRoleBadge.textContent = role === "admin" ? "Admin" : "Chủ quản";
    currentRoleBadge.style.backgroundColor =
      role === "admin" ? "#fee2e2" : "#e0e7ff";
    currentRoleBadge.style.color = role === "admin" ? "#991b1b" : "#4338ca";

    document
      .querySelectorAll("li.role-admin-only")
      .forEach((el) => (el.style.display = role === "admin" ? "flex" : "none"));
    document
      .querySelectorAll("li.role-manager-only")
      .forEach(
        (el) =>
          (el.style.display =
            role === "admin" || role === "manager" ? "flex" : "none"),
      );
  }
});
