window.DashboardLocations = {
  currentPage: 1,
  itemsPerPage: 10,
  totalPages: 1,
  currentUploadedUrls: [],
  currentPriceLocationId: null,
  locationsCacheMap: {},
  priceItemsCacheMap: {},

  escapeHTML: function (str) {
    return window.Phase2Engine
      ? window.Phase2Engine.escapeHTML(str)
      : String(str || "");
  },

  init: function () {
    this.setupPaginationEvents();
    this.loadLocationsFromDB();
    this.setupModalEvents();
    this.setupPriceModalEvents();
    if (window.DashboardApp.currentProfile?.role === "admin") {
      this.loadCommunityPriceModeration();
      this.loadDiscrepancyReports();
    }
  },

  setupPaginationEvents: function () {
    const self = this;
    const paginationContainer = document.getElementById("loc-pagination");
    if (!paginationContainer) return;
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

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#0052cc; margin-bottom:10px;"></i><br><span style="color:#666; font-size:14px;">Đang tải dữ liệu...</span></td></tr>`;

    let query = supabase
      .from("locations")
      .select("*, categories!locations_category_id_fkey(name)", {
        count: "exact",
      })
      .order("id", { ascending: false });

    // Nếu là manager thì chỉ quản lý các điểm của chính mình
    if (window.DashboardApp.currentProfile?.role === "manager") {
      query = query.eq("owner_id", window.DashboardApp.currentUser.id);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      if (window.Toast) window.Toast.show("Lỗi tải dữ liệu", "error");
      return;
    }

    this.totalPages = Math.ceil(count / this.itemsPerPage) || 1;
    const statLoc = document.getElementById("stat-location-count");
    if (statLoc) statLoc.textContent = count;
    pageInfo.textContent = `Trang ${this.currentPage} / ${this.totalPages}`;
    prevBtn.disabled = this.currentPage === 1;
    nextBtn.disabled = this.currentPage === this.totalPages;

    tableBody.innerHTML = "";
    if (!data || data.length === 0) {
      tableBody.innerHTML =
        "<tr><td colspan='5' style='text-align:center;'>Không có dữ liệu.</td></tr>";
      return;
    }

    this.locationsCacheMap = {};
    data.forEach((item) => {
      this.locationsCacheMap[item.id] = item;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${item.id}</td>
        <td><strong>${this.escapeHTML(item.name)}</strong></td>
        <td>${this.escapeHTML(item.categories?.name || "Chưa phân loại")}</td>
        <td><span class="status-badge ${item.status === "active" ? "active" : "pending"}">${this.escapeHTML(item.status)}</span></td>
        <td>
          <button class="btn-icon btn-prices" data-id="${item.id}" style="color: #10b981;" title="Quản lý giá"><i class="fa-solid fa-tags"></i></button>
          <button class="btn-icon edit" data-id="${item.id}" style="color: #f59e0b;" title="Sửa địa điểm"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete" data-id="${item.id}" style="color: #ef4444;" title="Xóa địa điểm"><i class="fa-solid fa-trash"></i></button>
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
        const currentBtn = e.currentTarget;
        const id = currentBtn.getAttribute("data-id");
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
        const id = e.currentTarget.getAttribute("data-id");
        const item = self.locationsCacheMap[id];
        if (!item) return;

        document.getElementById("loc-id").value = item.id;
        document.getElementById("loc-name").value = item.name;
        document.getElementById("loc-category").value = item.category_id;
        document.getElementById("loc-lat").value = item.lat;
        document.getElementById("loc-lng").value = item.lng;
        document.getElementById("loc-desc").value = item.description || "";

        self.currentUploadedUrls = item.image_urls ? [...item.image_urls] : [];
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

    document.querySelectorAll(".btn-prices").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const locId = e.currentTarget.getAttribute("data-id");
        const item = self.locationsCacheMap[locId];
        self.openPriceModal(locId, item ? item.name : "");
      }),
    );
  },

  renderPreviewGallery: function (localFiles = []) {
    const container = document.getElementById("image-preview-container");
    container.innerHTML = "";
    const self = this;

    this.currentUploadedUrls.forEach((url, index) => {
      const wrap = document.createElement("div");
      wrap.className = "img-wrap";
      const img = document.createElement("img");
      img.src = window.Phase2Engine
        ? window.Phase2Engine.sanitizeUrl(url)
        : url;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove-img-btn";
      btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      btn.onclick = () => {
        self.currentUploadedUrls.splice(index, 1);
        self.renderPreviewGallery(
          document.getElementById("loc-image-file").files,
        );
      };
      wrap.appendChild(img);
      wrap.appendChild(btn);
      container.appendChild(wrap);
    });

    Array.from(localFiles).forEach((file) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const wrap = document.createElement("div");
        wrap.className = "img-wrap";
        const img = document.createElement("img");
        img.src = e.target.result;
        img.style.borderColor = "#10b981";
        img.title = "Ảnh chưa lưu";
        wrap.appendChild(img);
        container.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });
  },

  setupModalEvents: function () {
    const modal = document.getElementById("location-modal");
    const self = this;

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

    document
      .getElementById("save-location-btn")
      .addEventListener("click", async (e) => {
        const btn = e.currentTarget;
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
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split(".").pop()}`;
            const { error: uploadError } = await supabase.storage
              .from("location-images")
              .upload(fileName, file);
            if (!uploadError) {
              return supabase.storage
                .from("location-images")
                .getPublicUrl(fileName).data.publicUrl;
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
        self.loadLocationsFromDB();
        if (currentProfile?.role === "admin" && window.DashboardUsers) {
          window.DashboardUsers.loadPendingLocations();
        }
      });
  },

  // ===============================================
  // QUẢN LÝ BẢNG GIÁ NIÊM YẾT (ĐÃ THÊM RÀNG BUỘC MIN <= MAX)
  // ===============================================
  setupPriceModalEvents: function () {
    const self = this;
    const priceModal = document.getElementById("price-modal");
    if (!priceModal) return;

    document
      .getElementById("close-price-modal-btn")
      ?.addEventListener("click", () => {
        priceModal.classList.remove("active");
        self.resetPriceForm();
      });

    document
      .getElementById("btn-reset-price-form")
      ?.addEventListener("click", () => {
        self.resetPriceForm();
      });

    document
      .getElementById("btn-save-price")
      ?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const itemName = document
          .getElementById("price-item-name")
          .value.trim();
        const itemUnit = document
          .getElementById("price-item-unit")
          .value.trim();
        const itemMin = parseFloat(
          document.getElementById("price-item-min").value,
        );
        let itemMax = parseFloat(
          document.getElementById("price-item-max").value,
        );
        const conditionType =
          document.getElementById("price-item-condition")?.value || "normal";
        const priceItemId = document.getElementById("price-item-id").value;

        if (!itemName || !itemUnit || isNaN(itemMin) || itemMin < 0) {
          if (window.Toast)
            window.Toast.show(
              "Vui lòng điền đủ Tên, Đơn vị và Giá thấp nhất >= 0!",
              "info",
            );
          return;
        }

        if (isNaN(itemMax)) itemMax = itemMin;
        if (itemMax < itemMin) {
          if (window.Toast)
            window.Toast.show(
              "Lỗi: Giá cao nhất không được nhỏ hơn giá thấp nhất!",
              "error",
            );
          return;
        }

        btn.disabled = true;
        btn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

        const supabase = window.DashboardApp.supabase;
        const payload = {
          location_id: self.currentPriceLocationId,
          item_name: itemName,
          unit: itemUnit,
          price_min: itemMin,
          price_max: itemMax,
          condition_type: conditionType,
          updated_at: new Date().toISOString(),
        };

        if (priceItemId) {
          const { error } = await supabase
            .from("price_items")
            .update(payload)
            .eq("id", priceItemId);
          if (error) window.Toast?.show("Lỗi: " + error.message, "error");
          else window.Toast?.show("Cập nhật giá thành công!", "success");
        } else {
          const { error } = await supabase
            .from("price_items")
            .insert([payload]);
          if (error) window.Toast?.show("Lỗi: " + error.message, "error");
          else window.Toast?.show("Thêm giá thành công!", "success");
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Giá';
        self.resetPriceForm();
        self.loadPricesTable();
      });
  },

  openPriceModal: function (locId, locName) {
    this.currentPriceLocationId = locId;
    document.getElementById("price-loc-name").textContent = locName;
    this.resetPriceForm();
    this.loadPricesTable();
    document.getElementById("price-modal").classList.add("active");
  },

  resetPriceForm: function () {
    document.getElementById("price-item-id").value = "";
    document.getElementById("price-item-name").value = "";
    document.getElementById("price-item-unit").value = "";
    document.getElementById("price-item-min").value = "";
    document.getElementById("price-item-max").value = "";
    if (document.getElementById("price-item-condition")) {
      document.getElementById("price-item-condition").value = "normal";
    }
    document.getElementById("btn-save-price").innerHTML =
      '<i class="fa-solid fa-floppy-disk"></i> Lưu Giá';
  },

  loadPricesTable: async function () {
    const supabase = window.DashboardApp.supabase;
    const tbody = document.querySelector("#prices-table tbody");
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

    const { data, error } = await supabase
      .from("price_items")
      .select("*")
      .eq("location_id", this.currentPriceLocationId)
      .order("updated_at", { ascending: false });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;">Lỗi tải dữ liệu.</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;">Chưa có dịch vụ nào được định giá.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    const formatCur = (val) => new Intl.NumberFormat("vi-VN").format(val);
    const condMap = window.Phase2Engine?.CONFIG.CONDITION_LABELS || {};
    const self = this;
    this.priceItemsCacheMap = {};

    data.forEach((item) => {
      this.priceItemsCacheMap[item.id] = item;
      const priceText =
        Number(item.price_min) === Number(item.price_max)
          ? `${formatCur(item.price_min)} ${this.escapeHTML(item.unit)}`
          : `${formatCur(item.price_min)} - ${formatCur(item.price_max)} ${this.escapeHTML(item.unit)}`;

      const dateText = new Date(item.updated_at).toLocaleDateString("vi-VN");
      const condLabel =
        condMap[item.condition_type || "normal"] || "Ngày thường";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <strong>${this.escapeHTML(item.item_name)}</strong><br/>
          <span style="font-size:11px; color:#64748b;">${this.escapeHTML(condLabel)}</span>
        </td>
        <td style="color: #0052cc; font-weight: 600;">${priceText}</td>
        <td style="font-size: 11px; color:#64748b;">${dateText}</td>
        <td style="text-align:center;">
          <button class="btn-icon edit-price" data-id="${item.id}" style="color: #f59e0b;"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon delete-price" data-id="${item.id}" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".edit-price").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const item = self.priceItemsCacheMap[id];
        if (!item) return;
        document.getElementById("price-item-id").value = item.id;
        document.getElementById("price-item-name").value = item.item_name;
        document.getElementById("price-item-unit").value = item.unit;
        document.getElementById("price-item-min").value = item.price_min;
        document.getElementById("price-item-max").value = item.price_max;
        if (document.getElementById("price-item-condition")) {
          document.getElementById("price-item-condition").value =
            item.condition_type || "normal";
        }
        document.getElementById("btn-save-price").innerHTML =
          '<i class="fa-solid fa-check"></i> Cập Nhật Giá';
      }),
    );

    tbody.querySelectorAll(".delete-price").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const priceId = e.currentTarget.getAttribute("data-id");
        const isConfirmed = await window.ConfirmModal.show(
          "Bạn muốn xóa mức giá này?",
          "Xóa",
          "Hủy",
          "danger",
        );
        if (isConfirmed) {
          await supabase.from("price_items").delete().eq("id", priceId);
          window.Toast?.show("Đã xóa mức giá!", "success");
          self.loadPricesTable();
        }
      }),
    );
  },

  // ===============================================
  // PHASE 2 ADMIN: DUYỆT GIÁ THỰC TRẢ & XỬ LÝ BÁO CÁO GIÁ SAI
  // ===============================================
  loadCommunityPriceModeration: async function () {
    const tbody = document.querySelector("#community-prices-table tbody");
    if (!tbody) return;
    const supabase = window.DashboardApp.supabase;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

    const { data, error } = await supabase
      .from("community_price_reports")
      .select("*, locations(name)")
      .eq("is_test_data", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu hoặc chưa chạy SQL Migration Phase 2.</td></tr>`;
      return;
    }

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b;">Chưa có phản hồi giá thực trả nào.</td></tr>`;
      return;
    }

    const fmt = (v) => new Intl.NumberFormat("vi-VN").format(v);
    const condMap = window.Phase2Engine?.CONFIG.CONDITION_LABELS || {};
    tbody.innerHTML = "";

    data.forEach((item) => {
      const tr = document.createElement("tr");
      const safeReceipt = window.Phase2Engine?.sanitizeUrl(item.receipt_url);
      tr.innerHTML = `
        <td>
          <strong>${this.escapeHTML(item.locations?.name || "")}</strong><br/>
          <span style="font-size:12px; color:#0052cc;">${this.escapeHTML(item.service_name)} (${this.escapeHTML(item.unit)})</span>
        </td>
        <td style="font-weight:700; color:#059669;">${fmt(item.actual_price)} đ</td>
        <td style="font-size:12px;">
          ${this.escapeHTML(condMap[item.condition_type] || item.condition_type)}<br/>
          <span style="color:#64748b;">${this.escapeHTML(item.transaction_date)}</span>
        </td>
        <td>
          ${safeReceipt ? `<a href="${safeReceipt}" target="_blank" rel="noopener noreferrer" style="color:#0052cc; font-size:12px;"><i class="fa-solid fa-image"></i> Xem hóa đơn</a>` : "<span style='font-size:12px; color:#94a3b8;'>Không kèm ảnh</span>"}
        </td>
        <td><span class="status-badge ${item.moderation_status === "approved" ? "active" : "pending"}">${this.escapeHTML(item.moderation_status)}</span></td>
        <td>
          <button class="btn btn-primary btn-cpr-act" data-id="${item.id}" data-status="approved" style="padding:4px 8px; font-size:12px;">Duyệt</button>
          <button class="btn btn-outline btn-cpr-act" data-id="${item.id}" data-status="rejected" style="padding:4px 8px; font-size:12px; color:#ef4444; border-color:#ef4444;">Từ chối</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const self = this;
    tbody.querySelectorAll(".btn-cpr-act").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const status = e.currentTarget.getAttribute("data-status");
        const { error: upErr } = await supabase
          .from("community_price_reports")
          .update({
            moderation_status: status,
            verification_level:
              status === "approved" ? "verified_by_mod" : "unverified",
            reviewed_by: window.DashboardApp.currentUser.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (!upErr) {
          window.Toast?.show(`Đã cập nhật trạng thái: ${status}`, "success");
          self.loadCommunityPriceModeration();
        }
      }),
    );
  },

  loadDiscrepancyReports: async function () {
    const tbody = document.querySelector("#discrepancy-reports-table tbody");
    if (!tbody) return;
    const supabase = window.DashboardApp.supabase;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

    const { data, error } = await supabase
      .from("price_discrepancy_reports")
      .select("*, locations(name)")
      .eq("is_test_data", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu hoặc chưa chạy SQL Migration Phase 2.</td></tr>`;
      return;
    }

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b;">Không có báo cáo giá sai nào.</td></tr>`;
      return;
    }

    const fmt = (v) =>
      v !== null && v !== undefined
        ? new Intl.NumberFormat("vi-VN").format(v) + " đ"
        : "Không rõ";
    tbody.innerHTML = "";

    data.forEach((item) => {
      const tr = document.createElement("tr");
      const urls = Array.isArray(item.evidence_urls) ? item.evidence_urls : [];
      const linksHtml = urls
        .map((u, idx) => {
          const safe = window.Phase2Engine?.sanitizeUrl(u);
          return safe
            ? `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="font-size:12px; color:#0052cc; margin-right:6px;">Ảnh ${idx + 1}</a>`
            : "";
        })
        .join("");

      tr.innerHTML = `
        <td>
          <strong>${this.escapeHTML(item.locations?.name || "")}</strong><br/>
          <span style="font-size:12px; color:#dc2626;">${this.escapeHTML(item.service_name)}</span>
        </td>
        <td style="font-size:12px;">
          Niêm yết: <strong>${fmt(item.listed_price)}</strong><br/>
          Thực thu: <strong style="color:#dc2626;">${fmt(item.charged_price)}</strong>
        </td>
        <td style="max-width:240px; font-size:12px;">
          ${this.escapeHTML(item.description)}<br/>
          <span style="color:#64748b; font-size:11px;">Ngày: ${this.escapeHTML(item.incident_date)}</span>
        </td>
        <td>${linksHtml || "<span style='font-size:12px; color:#94a3b8;'>Không có</span>"}</td>
        <td style="font-size:12px;">
          <span class="status-badge ${item.status === "resolved" ? "active" : "pending"}">${this.escapeHTML(item.status)}</span>
          ${item.admin_response ? `<div style="margin-top:4px; color:#334155;">PH: ${this.escapeHTML(item.admin_response)}</div>` : ""}
        </td>
        <td>
          <button class="btn btn-primary btn-dr-act" data-id="${item.id}" data-status="resolved" style="padding:4px 8px; font-size:12px;">Đã xử lý</button>
          <button class="btn btn-outline btn-dr-act" data-id="${item.id}" data-status="rejected" style="padding:4px 8px; font-size:12px; color:#ef4444; border-color:#ef4444;">Bác bỏ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const self = this;
    tbody.querySelectorAll(".btn-dr-act").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        const status = e.currentTarget.getAttribute("data-status");
        const note = window.prompt(
          "Nhập nội dung phản hồi / kết quả xử lý của Ban quản trị:",
          "Đã kiểm tra và nhắc nhở cơ sở cập nhật đúng giá niêm yết.",
        );
        if (note === null) return;

        const { error: upErr } = await supabase
          .from("price_discrepancy_reports")
          .update({
            status: status,
            admin_response: note.trim(),
            resolved_by: window.DashboardApp.currentUser.id,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (!upErr) {
          window.Toast?.show("Đã cập nhật kết quả xử lý báo cáo!", "success");
          self.loadDiscrepancyReports();
        }
      }),
    );
  },
};
