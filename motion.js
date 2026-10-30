/* NÚI SẬP MAP – motion.js : hiệu ứng xuất hiện, đếm số, ripple, navbar */
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. Cuộn-hiện cho các khối tĩnh */
  function initReveal() {
    if (reduce || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".chart-card, .table-container, .profile-wrapper .card.reviews-section, .section-header").forEach((el, i) => {
      el.style.setProperty("--d", (i % 4) * 70 + "ms");
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  /* 2. Đếm số cho thẻ thống kê (theo dõi khi JS cũ cập nhật giá trị) */
  function animateNumber(el, to) {
    const from = parseFloat(el.dataset.prev || "0") || 0;
    if (from === to || reduce) { el.textContent = to; el.dataset.prev = to; return; }
    const dur = 900, t0 = performance.now();
    const isInt = Number.isInteger(to);
    (function tick(t) {
      const p = Math.min((t - t0) / dur, 1), k = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * k;
      el.textContent = isInt ? Math.round(v) : v.toFixed(1);
      if (p < 1) requestAnimationFrame(tick); else el.dataset.prev = to;
    })(t0);
  }
  function initCounters() {
    document.querySelectorAll(".stat-num").forEach((el) => {
      let busy = false;
      new MutationObserver(() => {
        if (busy) return;
        if (!/^\d+(\.\d+)?$/.test(el.textContent.trim())) return; // bỏ qua ô có ký tự khác (vd: ⭐)
        const n = parseFloat(el.textContent);
        if (isNaN(n) || String(n) === el.dataset.prev) return;
        busy = true; animateNumber(el, n); setTimeout(() => (busy = false), 1000);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* 3. Ripple cho nút chính */
  function initRipple() {
    const sel = ".modern-submit-btn, .btn-primary, .iti-btn-primary, .iti-btn-success, .button-submit, .btn-save";
    document.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(sel);
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) / 2;
      const d = document.createElement("span");
      d.className = "ripple-dot";
      d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      b.appendChild(d); setTimeout(() => d.remove(), 650);
    });
  }

  /* 4. Navbar đổi trạng thái khi cuộn */
  function initNavbar() {
    const nav = document.querySelector(".site-navbar");
    if (!nav) return;
    addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });
  }

  /* 5. Fade-in toàn trang */
  function initPage() {
    if (reduce) return;
    document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out" });
  }

  function boot() { initPage(); initReveal(); initCounters(); initRipple(); initNavbar(); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
