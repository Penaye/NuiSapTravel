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

// ==========================================
// CUSTOM CONFIRM MODAL (Thay thế window.confirm)
// ==========================================
window.ConfirmModal = {
  show: function (
    message,
    confirmText = "Đồng ý",
    cancelText = "Hủy",
    type = "danger",
  ) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "custom-confirm-overlay";

      // Đổi màu nút và icon tùy theo loại hành động (Cảnh báo đỏ hoặc Xanh lam)
      const btnColor = type === "danger" ? "#ef4444" : "#0052cc";
      const iconClass =
        type === "danger" ? "fa-circle-exclamation" : "fa-circle-question";

      overlay.innerHTML = `
        <div class="custom-confirm-box">
          <i class="fa-solid ${iconClass}" style="color: ${btnColor}; font-size: 48px; margin-bottom: 16px;"></i>
          <h3 style="margin: 0 0 8px; color: #1e293b; font-size: 18px;">Xác nhận</h3>
          <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">${message}</p>
          <div class="custom-confirm-actions">
            <button class="btn-cancel">${cancelText}</button>
            <button class="btn-confirm" style="background-color: ${btnColor}">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Hàm xử lý đóng modal và trả kết quả
      const close = (result) => {
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.remove();
          resolve(result); // Trả về true nếu bấm Đồng ý, false nếu bấm Hủy
        }, 200);
      };

      overlay.querySelector(".btn-cancel").onclick = () => close(false);
      overlay.querySelector(".btn-confirm").onclick = () => close(true);
    });
  },
};
