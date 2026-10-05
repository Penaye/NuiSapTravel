window.DashboardAnalytics = {
  categoryChartInstance: null,
  monthlyChartInstance: null,

  init: async function () {
    await this.renderOverviewStats();
    await this.renderCategoryChart();
    await this.renderMonthlyChart();
  },

  renderOverviewStats: async function () {
    const supabase = window.DashboardApp.supabase;

    const { count: locCount } = await supabase
      .from("locations")
      .select("*", { count: "exact", head: true });

    const { data: reviews } = await supabase.from("reviews").select("rating");

    const totalLocations = locCount || 0;
    const totalReviews = reviews ? reviews.length : 0;

    let avgRating = 0;
    if (totalReviews > 0) {
      const sum = reviews.reduce((acc, cur) => acc + (cur.rating || 0), 0);
      avgRating = (sum / totalReviews).toFixed(1);
    }

    const statLoc = document.getElementById("stat-location-count");
    const statReview = document.getElementById("stat-review-count");
    const statAvg = document.getElementById("stat-avg-rating");

    if (statLoc) statLoc.textContent = totalLocations;
    if (statReview) statReview.textContent = totalReviews;
    if (statAvg) statAvg.textContent = `${avgRating} ⭐`;
  },

  renderCategoryChart: async function () {
    const supabase = window.DashboardApp.supabase;
    const canvas = document.getElementById("categoryChart");
    if (!canvas) return;

    // FIX: Chỉ định đích danh foreign key locations_category_id_fkey
    const { data, error } = await supabase
      .from("locations")
      .select("categories!locations_category_id_fkey(name)");

    if (error || !data) return console.error("Lỗi tải danh mục:", error);

    const counts = {};
    data.forEach((item) => {
      const catName = item.categories?.name || "Chưa phân loại";
      counts[catName] = (counts[catName] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const chartData = Object.values(counts);

    if (this.categoryChartInstance) {
      this.categoryChartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    this.categoryChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: chartData,
            backgroundColor: [
              "#2E8B57",
              "#FF8C00",
              "#800080",
              "#0052cc",
              "#64748b",
            ],
            borderWidth: 2,
            borderColor: "#ffffff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
          },
        },
      },
    });
  },

  renderMonthlyChart: async function () {
    const supabase = window.DashboardApp.supabase;
    const canvas = document.getElementById("monthlyChart");
    if (!canvas) return;

    const { data, error } = await supabase
      .from("locations")
      .select("created_at");

    if (error || !data) return console.error("Lỗi tải tháng:", error);

    const monthsMap = {};
    const monthLabels = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
      monthLabels.push(key);
      monthsMap[key] = 0;
    }

    data.forEach((item) => {
      if (item.created_at) {
        const d = new Date(item.created_at);
        const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
        if (monthsMap[key] !== undefined) {
          monthsMap[key]++;
        }
      }
    });

    const monthlyCounts = monthLabels.map((m) => monthsMap[m]);

    if (this.monthlyChartInstance) {
      this.monthlyChartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    this.monthlyChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthLabels.map((m) => `T${m}`),
        datasets: [
          {
            label: "Địa điểm mới",
            data: monthlyCounts,
            backgroundColor: "#0052cc",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  },
};
