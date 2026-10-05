window.Toast = {
  container: null,
  init: function () {
    if (!document.getElementById("toast-container")) {
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById("toast-container");
    }
  },
  show: function (message, type = "info") {
    this.init();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === "success") icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === "error")
      icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    this.container.appendChild(toast);

    // Tự động xóa khỏi DOM sau 3.5 giây để tránh rác HTML
    setTimeout(() => {
      if (this.container.contains(toast)) {
        toast.remove();
      }
    }, 3500);
  },
};
