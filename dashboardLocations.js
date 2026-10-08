window.DashboardLocations = {
  currentPage: 1,
  itemsPerPage: 10,
  totalPages: 1,

  // Lưu state mảng ảnh của địa điểm đang chỉnh sửa
  currentUploadedUrls: [],

  init: function () {
    this.setupPaginationEvents();
    this.loadLocationsFromDB();
    this.setupModalEvents();
  },

  setupPaginationEvents: function () {
    const self = this;
    const paginationContainer = document.getElementById("loc-pagination");
    const prevBtn = paginationContainer.querySelector(".btn-prev");
    const nextBtn = paginationContainer.querySelector(".btn-next");

    prevBtn.addEventListener("click", () => {
      if (self.currentPage > 1) {
        self.currentPage--;
        self.loadLocationsFromDB();
      }
    });

    nextBtn.addEventListener("click", () => {
      if (self.currentPage < self.totalPages) {
        self.currentPage++;
        self.loadLocationsFromDB();
      }
    });
  },

  loadLocationsFromDB: async function () {
    const supabase = window.DashboardApp.supabase;
    const tableBody = document.querySelector("#location-table tbody");
    const paginationContainer = document.getElementById("loc-pagination");
    const prevBtn = paginationContainer.querySelector(".btn-prev");
    const nextBtn = paginationContainer.querySelector(".btn-next");
    const pageInfo = paginationContainer.querySelector(".page-info");

    const from = (this.currentPage - 1) * this.itemsPerPage;
    const to = from + this.itemsPerPage - 1;

    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#0052cc; margin-bottom:10px;"></i><br><span style="color:#666; font-size:14px;">Đang tải dữ liệu...</span></td></tr>`;

    // Nạp thêm image_urls thay cho image_url cũ
    const { data, error, count } = await supabase
      .from("locations")
      .select("*, categories!locations_category_id_fkey(name)", {
        count: "exact",
      })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      if (window.Toast) window.Toast.show("Lỗi tải dữ liệu", "error");
      return;
    }

    this.totalPages = Math.ceil(count / this.itemsPerPage) || 1;
    document.getElementById("stat-location-count").textContent = count;
    pageInfo.textContent = `Trang ${this.currentPage} / ${this.totalPages}`;
    prevBtn.disabled = this.currentPage === 1;
    nextBtn.disabled = this.currentPage === this.totalPages;

    tableBody.innerHTML = "";
    if (data.length === 0) {
      tableBody.innerHTML =
        "<tr><td colspan='5' style='text-align:center;'>Không có dữ liệu.</td></tr>";
      return;
    }

    data.forEach((item) => {
      const itemData = encodeURIComponent(JSON.stringify(item));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${item.id}</td><td><strong>${item.name}</strong></td>
        <td>${item.categories?.name || "Chưa phân loại"}</td>
        <td><span class="status-badge ${item.status === "active" ? "active" : "pending"}">${item.status}</span></td>
        <td>
          <button class="btn-icon edit" data-item="${itemData}" style="color: #f59e0b;"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${item.id}" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    this.bindActionButtons();
  },

  bindActionButtons: function () {
    const self = this;
    const supabase = window.DashboardApp.supabase;

    document.querySelectorAll(".delete").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        // ĐÃ SỬA: LƯU BIẾN TRƯỚC KHI AWAIT
        const currentBtn = e.currentTarget;
        const id = currentBtn.getAttribute("data-id");

        // GỌI MODAL XÁC NHẬN MỚI
        const isConfirmed = await window.ConfirmModal.show(
          "Bạn có chắc chắn muốn xóa địa điểm này?",
          "Xóa",
          "Hủy",
          "danger",
        );

        if (isConfirmed) {
          currentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          currentBtn.disabled = true;

          await supabase.from("locations").delete().eq("id", id);
          if (window.Toast) window.Toast.show("Đã xóa địa điểm", "success");
          self.loadLocationsFromDB();
        }
      }),
    );

    document.querySelectorAll(".edit").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const rawData = e.currentTarget.getAttribute("data-item");
        const item = JSON.parse(decodeURIComponent(rawData));

        document.getElementById("loc-id").value = item.id;
        document.getElementById("loc-name").value = item.name;
        document.getElementById("loc-category").value = item.category_id;
        document.getElementById("loc-lat").value = item.lat;
        document.getElementById("loc-lng").value = item.lng;
        document.getElementById("loc-desc").value = item.description || "";

        // Reset state & UI ảnh
        self.currentUploadedUrls = item.image_urls || [];
        if (
          item.image_url &&
          !self.currentUploadedUrls.includes(item.image_url)
        ) {
          self.currentUploadedUrls.push(item.image_url);
        }

        document.getElementById("loc-image-file").value = "";
        self.renderPreviewGallery();

        document.getElementById("modal-title").textContent = "Sửa Địa Điểm";
        document.getElementById("location-modal").classList.add("active");

        setTimeout(() => {
          window.DashboardMap.init();
          if (window.DashboardMap.miniMap) {
            window.DashboardMap.miniMap.resize();
            window.DashboardMap.miniMap.flyTo({
              center: [item.lng, item.lat],
              zoom: 15,
            });
          }
          window.DashboardMap.setMarker(item.lng, item.lat);
        }, 300);
      }),
    );
  },

  // Hàm render grid ảnh (Cả ảnh đã up và ảnh local)
  renderPreviewGallery: function (localFiles = []) {
    const container = document.getElementById("image-preview-container");
    container.innerHTML = "";
    const self = this;

    // Hiển thị các ảnh ĐÃ UPLOAD (Có sẵn URL)
    this.currentUploadedUrls.forEach((url, index) => {
      const wrap = document.createElement("div");
      wrap.className = "img-wrap";
      wrap.innerHTML = `
        <img src="${url}" />
        <button type="button" class="remove-img-btn" data-type="url" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
      `;
      container.appendChild(wrap);
    });

    // Hiển thị các ảnh MỚI CHỌN TỪ LOCAL (Base64)
    Array.from(localFiles).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const wrap = document.createElement("div");
        wrap.className = "img-wrap";
        wrap.innerHTML = `
          <img src="${e.target.result}" style="border-color:#10b981;" title="Ảnh chưa lưu" />
        `;
        container.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });

    // Gắn sự kiện xóa ảnh ĐÃ UPLOAD
    container
      .querySelectorAll('.remove-img-btn[data-type="url"]')
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const idx = e.currentTarget.getAttribute("data-index");
          self.currentUploadedUrls.splice(idx, 1); // Xóa khỏi mảng
          self.renderPreviewGallery(
            document.getElementById("loc-image-file").files,
          ); // Render lại
        });
      });
  },

  setupModalEvents: function () {
    const modal = document.getElementById("location-modal");
    const self = this;

    // Bắt sự kiện chọn thêm ảnh mới
    document
      .getElementById("loc-image-file")
      .addEventListener("change", function (e) {
        self.renderPreviewGallery(e.target.files);
      });

    function resetAndCloseModal() {
      document.getElementById("loc-id").value = "";
      document.getElementById("loc-name").value = "";
      document.getElementById("loc-lat").value = "";
      document.getElementById("loc-lng").value = "";
      document.getElementById("loc-desc").value = "";
      document.getElementById("loc-category").value = "1";
      document.getElementById("loc-image-file").value = "";

      self.currentUploadedUrls = [];
      document.getElementById("image-preview-container").innerHTML = "";
      document.getElementById("upload-status").style.display = "none";

      const saveBtn = document.getElementById("save-location-btn");
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Lưu Địa Điểm";

      document.getElementById("modal-title").textContent = "Thêm Địa Điểm Mới";
      window.DashboardMap.resetMap();
      modal.classList.remove("active");
    }

    document
      .getElementById("add-location-btn")
      .addEventListener("click", () => {
        resetAndCloseModal();
        modal.classList.add("active");
        setTimeout(() => window.DashboardMap.init(), 300);
      });

    document
      .getElementById("close-modal-btn")
      .addEventListener("click", resetAndCloseModal);
    document
      .getElementById("cancel-modal-btn")
      .addEventListener("click", resetAndCloseModal);

    // GỬI DATA VÀ UPLOAD HÀNG LOẠT
    document
      .getElementById("save-location-btn")
      .addEventListener("click", async (e) => {
        // e.target an toàn vì khai báo ngay đầu sự kiện, không bị đứt đoạn bởi await
        const btn = e.target;
        const supabase = window.DashboardApp.supabase;
        const currentUser = window.DashboardApp.currentUser;
        const currentProfile = window.DashboardApp.currentProfile;

        const locId = document.getElementById("loc-id").value;
        const name = document.getElementById("loc-name").value.trim();
        const category_id = parseInt(
          document.getElementById("loc-category").value,
        );
        const lat = parseFloat(document.getElementById("loc-lat").value);
        const lng = parseFloat(document.getElementById("loc-lng").value);
        const description = document.getElementById("loc-desc").value.trim();

        if (!name || isNaN(lat) || isNaN(lng)) {
          if (window.Toast)
            window.Toast.show("Vui lòng chọn tọa độ và nhập tên!", "info");
          return;
        }

        btn.disabled = true;
        btn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

        const fileInput = document.getElementById("loc-image-file");
        const files = Array.from(fileInput.files);

        let finalImageUrls = [...self.currentUploadedUrls];

        if (files.length > 0) {
          document.getElementById("upload-status").style.display = "block";

          const uploadPromises = files.map(async (file) => {
            const fileExt = file.name.split(".").pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
              .from("location-images")
              .upload(fileName, file);
            if (!uploadError) {
              const { data } = supabase.storage
                .from("location-images")
                .getPublicUrl(fileName);
              return data.publicUrl;
            }
            return null;
          });

          const newUrls = await Promise.all(uploadPromises);
          finalImageUrls = finalImageUrls.concat(
            newUrls.filter((url) => url !== null),
          );

          document.getElementById("upload-status").style.display = "none";
        }

        const finalStatus =
          currentProfile?.role === "admin" ? "active" : "pending";

        const payload = {
          category_id,
          name,
          description,
          lat,
          lng,
          image_urls: finalImageUrls,
          image_url: finalImageUrls[0] || null,
        };

        if (locId) {
          if (currentProfile?.role === "manager") payload.status = "pending";
          const { error } = await supabase
            .from("locations")
            .update(payload)
            .eq("id", locId);
          if (error && window.Toast)
            window.Toast.show("Lỗi cập nhật: " + error.message, "error");
          else if (window.Toast)
            window.Toast.show("Đã lưu sửa đổi!", "success");
        } else {
          payload.owner_id = currentUser.id;
          payload.status = finalStatus;
          const { error } = await supabase.from("locations").insert([payload]);
          if (error && window.Toast)
            window.Toast.show("Lỗi thêm mới: " + error.message, "error");
          else if (window.Toast)
            window.Toast.show("Thêm địa điểm thành công!", "success");
        }

        resetAndCloseModal();
        self.currentPage = 1;
        self.loadLocationsFromDB();
        if (currentProfile?.role === "admin" && window.DashboardUsers) {
          window.DashboardUsers.loadPendingLocations();
        }
      });
  },
};
