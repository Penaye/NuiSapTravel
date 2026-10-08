window.DashboardReviews = {
  currentPage: 1,
  itemsPerPage: 10,
  totalPages: 1,

  init: function () {
    this.setupPaginationEvents();
    this.loadReviewsFromDB();
  },

  setupPaginationEvents: function () {
    const self = this;
    const paginationContainer = document.getElementById("review-pagination");
    const prevBtn = paginationContainer.querySelector(".btn-prev");
    const nextBtn = paginationContainer.querySelector(".btn-next");

    prevBtn.addEventListener("click", () => {
      if (self.currentPage > 1) {
        self.currentPage--;
        self.loadReviewsFromDB();
      }
    });

    nextBtn.addEventListener("click", () => {
      if (self.currentPage < self.totalPages) {
        self.currentPage++;
        self.loadReviewsFromDB();
      }
    });
  },

  loadReviewsFromDB: async function () {
    const supabase = window.DashboardApp.supabase;
    const reviewsTableBody = document.querySelector("#reviews-table tbody");
    const paginationContainer = document.getElementById("review-pagination");
    const prevBtn = paginationContainer.querySelector(".btn-prev");
    const nextBtn = paginationContainer.querySelector(".btn-next");
    const pageInfo = paginationContainer.querySelector(".page-info");

    const from = (this.currentPage - 1) * this.itemsPerPage;
    const to = from + this.itemsPerPage - 1;

    // UI: Loading Row
    reviewsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#0052cc; margin-bottom:10px;"></i><br><span style="color:#666; font-size:14px;">Đang tải đánh giá...</span></td></tr>`;

    const { data, error, count } = await supabase
      .from("reviews")
      .select("*, locations(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return console.error("Lỗi tải reviews:", error);

    this.totalPages = Math.ceil(count / this.itemsPerPage) || 1;
    pageInfo.textContent = `Trang ${this.currentPage} / ${this.totalPages}`;
    prevBtn.disabled = this.currentPage === 1;
    nextBtn.disabled = this.currentPage === this.totalPages;

    reviewsTableBody.innerHTML = "";
    if (data.length === 0) {
      reviewsTableBody.innerHTML =
        "<tr><td colspan='6' style='text-align:center;'>Không có dữ liệu.</td></tr>";
      return;
    }

    data.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-size: 13px; color: #666;">#${item.id}</td>
        <td><strong>${item.locations?.name || "Đã bị xóa"}</strong></td>
        <td>${item.guest_name}</td>
        <td style="color: #f59e0b; font-size: 12px;">${"⭐".repeat(item.rating)}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${item.comment}</td>
        <td>
          <button class="btn-icon delete-review" data-id="${item.id}" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      reviewsTableBody.appendChild(tr);
    });

    const self = this;
    document.querySelectorAll(".delete-review").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        // ĐÃ SỬA: LƯU BIẾN TRƯỚC KHI AWAIT
        const currentBtn = e.currentTarget;
        const id = currentBtn.getAttribute("data-id");

        // GỌI MODAL XÁC NHẬN MỚI
        const isConfirmed = await window.ConfirmModal.show(
          "Bạn có chắc chắn muốn xóa đánh giá này không?",
          "Xóa",
          "Hủy",
          "danger",
        );

        if (isConfirmed) {
          currentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          currentBtn.disabled = true;

          await supabase.from("reviews").delete().eq("id", id);
          self.loadReviewsFromDB();
        }
      }),
    );
  },
};
