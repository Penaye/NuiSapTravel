document.addEventListener("DOMContentLoaded", async () => {
  const supabase = window.supabaseClient;

  // 1. Kiểm tra đăng nhập, chưa đăng nhập thì đuổi ra trang auth
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    Toast.show("Vui lòng đăng nhập để xem trang cá nhân!");
    window.location.href = "auth.html";
    return;
  }

  const user = session.user;

  // 2. TẢI THÔNG TIN PROFILE HIỆN TẠI
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile) {
    document.getElementById("profile-name").value = profile.full_name || "";
    if (profile.avatar_url) {
      document.getElementById("profile-avatar-preview").src =
        profile.avatar_url;
    }
  }

  // 3. XỬ LÝ PREVIEW KHI CHỌN ẢNH AVATAR
  const avatarInput = document.getElementById("profile-avatar-file");
  const avatarPreview = document.getElementById("profile-avatar-preview");
  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => (avatarPreview.src = e.target.result);
      reader.readAsDataURL(file);
    }
  });

  // 4. LƯU PROFILE (UPLOAD ẢNH LÊN STORAGE + UPDATE DATABASE)
  document
    .getElementById("btn-save-profile")
    .addEventListener("click", async (e) => {
      const btn = e.target;
      const newName = document.getElementById("profile-name").value.trim();
      const file = avatarInput.files[0];

      if (!newName) return Toast.show("Vui lòng nhập tên hiển thị!");

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

      let updatedAvatarUrl = profile?.avatar_url || null;

      // Nếu có chọn file mới thì upload vào bucket 'avatars'
      if (file) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, file, { upsert: true });

        if (uploadError) {
          Toast.show("Lỗi tải ảnh đại diện: " + uploadError.message);
          btn.disabled = false;
          btn.textContent = "Lưu Thay Đổi";
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);

        updatedAvatarUrl = publicUrlData.publicUrl;
      }

      // Update thông tin vào bảng profiles
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: newName, avatar_url: updatedAvatarUrl })
        .eq("id", user.id);

      btn.disabled = false;
      btn.textContent = "Lưu Thay Đổi";

      if (error) Toast.show("Lỗi khi cập nhật thông tin: " + error.message);
      else {
        Toast.show("Cập nhật thành công!");
        avatarInput.value = ""; // Xóa input file sau khi up thành công
      }
    });

  // 5. LẤY & HIỂN THỊ DANH SÁCH REVIEW CỦA CHÍNH MÌNH ĐÃ VIẾT
  async function loadMyReviews() {
    const listEl = document.getElementById("my-reviews-list");

    // Nối với bảng locations để lấy tên địa điểm
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("*, locations(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      listEl.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu.</p>';
      return;
    }

    if (!reviews || reviews.length === 0) {
      listEl.innerHTML =
        '<p style="color: var(--text-sub); padding: 20px 0; text-align: center;">Bạn chưa có bài đánh giá nào.</p>';
      return;
    }

    // Lấy chức vụ của user hiện tại (đã được fetch ở đầu file profile.js)
    const userRole = profile?.role || "user";

    listEl.innerHTML = reviews
      .map((r) => {
        // ẨN NÚT XÓA NẾU CHỈ LÀ USER BÌNH THƯỜNG
        let deleteBtnHtml = "";
        if (userRole === "admin" || userRole === "manager") {
          deleteBtnHtml = `
            <div>
              <button class="btn-delete btn-del-review" data-id="${r.id}">
                <i class="fa-solid fa-trash"></i> Xóa đánh giá
              </button>
            </div>
          `;
        }

        return `
          <div class="review-item">
            <div class="review-header">
              <div>
                <div class="loc-name">
                  <i class="fa-solid fa-location-dot" style="color: #0052cc;"></i> 
                  ${r.locations?.name || "Địa điểm không xác định"}
                </div>
                <span class="loc-date">${new Date(r.created_at).toLocaleDateString("vi-VN")}</span>
              </div>
              <div class="review-stars">${"⭐".repeat(r.rating)}</div>
            </div>
            <p class="review-text">${r.comment}</p>
            ${r.image_url ? `<img src="${r.image_url}" class="review-img" />` : ""}
            
            ${deleteBtnHtml}
          </div>
        `;
      })
      .join("");

    // Gắn sự kiện Xóa đánh giá (Sử dụng ConfirmModal)
    document.querySelectorAll(".btn-del-review").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        // 1. LƯU LẠI NÚT VÀO BIẾN TRƯỚC KHI AWAIT
        const currentBtn = e.currentTarget;
        const id = currentBtn.getAttribute("data-id");

        const isConfirmed = await window.ConfirmModal.show(
          "Bạn có chắc muốn xóa đánh giá này không?",
          "Xóa",
          "Hủy",
          "danger",
        );

        if (isConfirmed) {
          // 2. DÙNG BIẾN ĐÃ LƯU ĐỂ THAY ĐỔI GIAO DIỆN
          currentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          currentBtn.disabled = true;

          await supabase.from("reviews").delete().eq("id", id);
          loadMyReviews(); // Tải lại danh sách ngay lập tức
        }
      });
    });
  }

  // Gọi hàm load dữ liệu đánh giá
  loadMyReviews();

  // ===============================================
  // 6. XỬ LÝ ĐĂNG XUẤT (Sử dụng ConfirmModal)
  // ===============================================
  const btnLogout = document.getElementById("btn-logout-profile");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      const isConfirmed = await window.ConfirmModal.show(
        "Bạn có chắc chắn muốn thoát tài khoản?",
        "Thoát ngay",
        "Hủy",
        "danger",
      );

      if (isConfirmed) {
        btnLogout.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Đang thoát...';
        await supabase.auth.signOut();
        window.location.href = "index.html"; // Chuyển về trang bản đồ sau khi thoát
      }
    });
  }
});
