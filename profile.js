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
        '<p style="color: #64748b;">Bạn chưa có bài đánh giá nào.</p>';
      return;
    }

    listEl.innerHTML = reviews
      .map(
        (r) => `
      <div class="my-review-item">
        <div class="mr-header">
          <div>
            <div class="mr-loc-name"><i class="fa-solid fa-location-dot"></i> ${r.locations?.name || "Địa điểm không xác định"}</div>
            <div class="mr-date">${new Date(r.created_at).toLocaleDateString("vi-VN")}</div>
          </div>
          <div class="mr-rating">${"⭐".repeat(r.rating)}</div>
        </div>
        <p style="margin:0; font-size: 14px; color: #333;">${r.comment}</p>
        ${r.image_url ? `<img src="${r.image_url}" class="mr-img" />` : ""}
        
        <div class="mr-actions">
          <button class="btn btn-outline btn-del-review" data-id="${r.id}" style="padding: 5px 10px; font-size: 12px; color: #ef4444; border-color: #ef4444;">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </div>
      </div>
    `,
      )
      .join("");

    // Gắn sự kiện Xóa đánh giá
    document.querySelectorAll(".btn-del-review").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        if (confirm("Bạn có chắc muốn xóa đánh giá này?")) {
          e.currentTarget.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i>';
          e.currentTarget.disabled = true;

          await supabase.from("reviews").delete().eq("id", id);
          loadMyReviews(); // Tải lại danh sách ngay lập tức
        }
      });
    });
  }

  loadMyReviews();
});
