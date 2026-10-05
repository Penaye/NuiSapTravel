window.DashboardUsers = {
  pendingPage: 1,
  pendingTotalPages: 1,

  userPage: 1,
  userTotalPages: 1,

  itemsPerPage: 10,

  init: function () {
    this.setupPendingPaginationEvents();
    this.setupUserPaginationEvents();
    this.loadPendingLocations();
    this.loadUsersFromDB();
  },

  setupPendingPaginationEvents: function () {
    const self = this;
    const container = document.getElementById("approve-pagination");
    const prevBtn = container.querySelector(".btn-prev");
    const nextBtn = container.querySelector(".btn-next");

    prevBtn.addEventListener("click", () => {
      if (self.pendingPage > 1) {
        self.pendingPage--;
        self.loadPendingLocations();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (self.pendingPage < self.pendingTotalPages) {
        self.pendingPage++;
        self.loadPendingLocations();
      }
    });
  },

  setupUserPaginationEvents: function () {
    const self = this;
    const container = document.getElementById("user-pagination");
    const prevBtn = container.querySelector(".btn-prev");
    const nextBtn = container.querySelector(".btn-next");

    prevBtn.addEventListener("click", () => {
      if (self.userPage > 1) {
        self.userPage--;
        self.loadUsersFromDB();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (self.userPage < self.userTotalPages) {
        self.userPage++;
        self.loadUsersFromDB();
      }
    });
  },

  loadPendingLocations: async function () {
    const supabase = window.DashboardApp.supabase;
    const approveTableBody = document.querySelector("#approve-table tbody");
    const container = document.getElementById("approve-pagination");

    const from = (this.pendingPage - 1) * this.itemsPerPage;
    const to = from + this.itemsPerPage - 1;

    approveTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#0052cc; margin-bottom:10px;"></i><br><span style="color:#666; font-size:14px;">Đang tải dữ liệu...</span></td></tr>`;

    // FIX: Chỉ định đích danh foreign key locations_category_id_fkey để tránh lỗi PGRST201
    const { data, error, count } = await supabase
      .from("locations")
      .select("*, categories!locations_category_id_fkey(name)", {
        count: "exact",
      })
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Lỗi tải danh sách chờ duyệt:", error);
      return;
    }

    this.pendingTotalPages = Math.ceil(count / this.itemsPerPage) || 1;
    container.querySelector(".page-info").textContent =
      `Trang ${this.pendingPage} / ${this.pendingTotalPages}`;
    container.querySelector(".btn-prev").disabled = this.pendingPage === 1;
    container.querySelector(".btn-next").disabled =
      this.pendingPage === this.pendingTotalPages;

    approveTableBody.innerHTML = "";
    if (data.length === 0) {
      approveTableBody.innerHTML =
        "<tr><td colspan='5' style='text-align:center; color: #666;'>Không có địa điểm nào đang chờ duyệt.</td></tr>";
      return;
    }

    data.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${item.id}</td>
        <td><strong>${item.name}</strong></td>
        <td>${item.categories?.name || "Chưa phân loại"}</td>
        <td style="font-size: 12px; color: #666;">${item.owner_id ? item.owner_id.substring(0, 8) + "..." : "Ẩn danh"}</td>
        <td>
          <button class="btn btn-primary btn-approve" data-id="${item.id}" style="padding: 4px 10px; font-size: 13px;">Duyệt</button>
          <button class="btn btn-outline btn-reject" data-id="${item.id}" style="padding: 4px 10px; font-size: 13px; color: #ef4444; border-color: #ef4444;">Từ chối</button>
        </td>
      `;
      approveTableBody.appendChild(tr);
    });

    const self = this;
    document.querySelectorAll(".btn-approve").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        if (confirm("Chấp thuận đưa địa điểm này lên bản đồ?")) {
          e.currentTarget.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i>';
          e.currentTarget.disabled = true;

          await supabase
            .from("locations")
            .update({ status: "active" })
            .eq("id", id);
          self.loadPendingLocations();
          if (window.DashboardLocations)
            window.DashboardLocations.loadLocationsFromDB();
        }
      }),
    );

    document.querySelectorAll(".btn-reject").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        if (confirm("Từ chối và xóa địa điểm này?")) {
          e.currentTarget.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i>';
          e.currentTarget.disabled = true;

          await supabase.from("locations").delete().eq("id", id);
          self.loadPendingLocations();
        }
      }),
    );
  },

  loadUsersFromDB: async function () {
    const supabase = window.DashboardApp.supabase;
    const currentUser = window.DashboardApp.currentUser;
    const usersTableBody = document.querySelector("#users-table tbody");
    const container = document.getElementById("user-pagination");

    const from = (this.userPage - 1) * this.itemsPerPage;
    const to = from + this.itemsPerPage - 1;

    usersTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#0052cc; margin-bottom:10px;"></i><br><span style="color:#666; font-size:14px;">Đang tải danh sách...</span></td></tr>`;

    const { data, error, count } = await supabase
      .from("profiles")
      .select("id, full_name, role", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Lỗi tải người dùng:", error);
      return;
    }

    this.userTotalPages = Math.ceil(count / this.itemsPerPage) || 1;
    container.querySelector(".page-info").textContent =
      `Trang ${this.userPage} / ${this.userTotalPages}`;
    container.querySelector(".btn-prev").disabled = this.userPage === 1;
    container.querySelector(".btn-next").disabled =
      this.userPage === this.userTotalPages;

    usersTableBody.innerHTML = "";
    if (data.length === 0) {
      usersTableBody.innerHTML =
        "<tr><td colspan='3' style='text-align:center;'>Không có dữ liệu.</td></tr>";
      return;
    }

    data.forEach((user) => {
      const isSelf = user.id === currentUser.id;

      let badgeClass = "pending";
      let roleDisplay = "User";

      if (user.role === "admin") {
        badgeClass = "admin";
        roleDisplay = "Admin";
      } else if (user.role === "manager") {
        badgeClass = "active";
        roleDisplay = "Manager";
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-size: 13px;">
          <strong style="font-size: 15px; color: #1e293b;">${user.full_name || "Khách (Chưa cập nhật tên)"}</strong><br/>
          <span style="color: #64748b; font-size: 11px;">ID: ${user.id}</span>
          ${isSelf ? " <strong style='color:#0052cc;'>(Bạn)</strong>" : ""}
        </td>
        <td><span class="status-badge ${badgeClass}">${roleDisplay}</span></td>
        <td>
          <select class="form-input role-select" data-id="${user.id}" data-current="${user.role}" style="width: auto; padding: 6px; margin-bottom: 0;" ${isSelf ? "disabled" : ""}>
            <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
            <option value="manager" ${user.role === "manager" ? "selected" : ""}>Manager</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </td>
      `;
      usersTableBody.appendChild(tr);
    });

    const self = this;
    document.querySelectorAll(".role-select").forEach((select) =>
      select.addEventListener("change", async (e) => {
        const userId = e.target.getAttribute("data-id");
        const currentRole = e.target.getAttribute("data-current");
        const newRole = e.target.value;

        if (
          confirm(
            `Bạn có chắc chắn muốn thay đổi quyền người này thành ${newRole.toUpperCase()}?`,
          )
        ) {
          e.target.disabled = true;

          const { error } = await supabase
            .from("profiles")
            .update({ role: newRole })
            .eq("id", userId);
          if (error) {
            Toast.show("Lỗi khi đổi quyền: " + error.message);
            e.target.value = currentRole;
            e.target.disabled = false;
          } else {
            Toast.show("Cập nhật quyền thành công!");
            self.loadUsersFromDB();
          }
        } else {
          e.target.value = currentRole;
        }
      }),
    );
  },
};
