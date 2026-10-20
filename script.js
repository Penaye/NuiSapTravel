// ==========================================
// BẢN ĐỒ DU LỊCH NÚI SẬP - MAIN SCRIPT (FULL VERSION)
// ==========================================

const synth = window.speechSynthesis;
let currentUtterance = null;

const regionCoords = [
  [105.28841819246551, 10.25976845936709],
  [105.26661719912855, 10.240004604385135],
  [105.26095237408822, 10.24591699791054],
  [105.25022353798025, 10.260528583148007],
  [105.27065124039835, 10.285358284218805],
  [105.2706652462982, 10.285600583246355],
  [105.27088074825171, 10.286734138446143],
  [105.28690947035375, 10.261796986815968],
  [105.28841819246551, 10.25976845936709],
];

const lngs = regionCoords.map((c) => c[0]);
const lats = regionCoords.map((c) => c[1]);

let map;
let currentMapStyle = "streets";
let activeLocationId = null;
let activeLocationName = "";
let activeLocationPriceItems = [];

window.allLocations = [];
window.allPriceItemsCache = [];
let currentFilteredLocations = [];

let userLocation = null;
let userMarker = null;
let currentAuthUser = null;
let userBookmarkedIds = [];
let itineraryMarkers = [];
let lastPlannedResult = null;

const supabaseClient = window.supabaseClient;
const escapeHTML = (str) =>
  window.Phase2Engine
    ? window.Phase2Engine.escapeHTML(str)
    : String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const sanitizeUrl = (url) =>
  window.Phase2Engine
    ? window.Phase2Engine.sanitizeUrl(url)
    : String(url || "");

// THUẬT TOÁN TÍNH KHOẢNG CÁCH (Haversine)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function updateAudioBtnUI(isPlaying) {
  const btn = document.getElementById("btn-audio");
  if (!btn) return;
  if (isPlaying) {
    btn.innerHTML = `<i class="fa-solid fa-circle-pause"></i> Dừng`;
    btn.style.background = "#ef4444";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> Nghe`;
    btn.style.background = "#8b5cf6";
  }
}

function removeLoadingScreen() {
  const loader = document.getElementById("global-loader");
  if (loader && loader.style.display !== "none") {
    loader.style.opacity = "0";
    setTimeout(() => (loader.style.display = "none"), 300);
  }
}

// ==========================================
// 1. KHỞI TẠO BẢN ĐỒ MAPLIBRE
// ==========================================
function initMap() {
  try {
    map = new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
      center: [105.267768, 10.262644],
      zoom: 13,
      maxZoom: 18.5,
      maxBounds: [
        [Math.min(...lngs) - 0.2, Math.min(...lats) - 0.2],
        [Math.max(...lngs) + 0.2, Math.max(...lats) + 0.2],
      ],
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    initGeolocation();

    map.on("load", async () => {
      await fetchAndRenderData();
      addMapLayers();
      await checkGlobalAuth();
      removeLoadingScreen();
    });

    map.on("error", (e) => {
      console.warn("MapLibre Error:", e);
      removeLoadingScreen();
    });
  } catch (err) {
    console.error("Lỗi khởi tạo MapLibre:", err);
    removeLoadingScreen();
  }
}
setTimeout(() => removeLoadingScreen(), 3500);

function addMapLayers() {
  const maskGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
            regionCoords,
          ],
        },
      },
    ],
  };
  const boundaryGeoJSON = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [regionCoords] },
      },
    ],
  };

  if (!map.getSource("mask-src")) {
    map.addSource("mask-src", { type: "geojson", data: maskGeoJSON });
    map.addLayer({
      id: "mask-layer",
      type: "fill",
      source: "mask-src",
      paint: { "fill-color": "#000000", "fill-opacity": 0.65 },
    });
    map.addSource("boundary-src", { type: "geojson", data: boundaryGeoJSON });
    map.addLayer({
      id: "boundary-line",
      type: "line",
      source: "boundary-src",
      paint: {
        "line-color": "#ef4444",
        "line-width": 3,
        "line-dasharray": [2, 2],
      },
    });
    map.addSource("route-src", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] },
      },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-src",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#0052cc", "line-width": 6, "line-opacity": 0.85 },
    });
    map.addSource("Nuisaptravel-src", {
      type: "geojson",
      data: { type: "FeatureCollection", features: currentFilteredLocations },
    });
  }

  if (!map.getLayer("unclustered-point")) {
    map.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: "Nuisaptravel-src",
      paint: {
        "circle-color": [
          "match",
          ["get", "category"],
          "Du lịch",
          "#10b981",
          "Quán ăn",
          "#f59e0b",
          "Khách sạn",
          "#8b5cf6",
          "#3b82f6",
        ],
        "circle-radius": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          12,
          8,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "unclustered-icon",
      type: "symbol",
      source: "Nuisaptravel-src",
      layout: {
        "text-field": ["get", "name"],
        "text-offset": [0, 1],
        "text-anchor": "top",
        "text-size": 13,
      },
      paint: {
        "text-color": "#1e293b",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }

  let hoveredId = null;
  const isMobile = window.innerWidth <= 768 || "ontouchstart" in window;
  if (isMobile) {
    map.on("click", (e) => {
      const bbox = [
        [e.point.x - 25, e.point.y - 25],
        [e.point.x + 25, e.point.y + 25],
      ];
      const f = map.queryRenderedFeatures(bbox, {
        layers: ["unclustered-point", "unclustered-icon"],
      });
      if (f.length > 0) {
        openLocationSidebar(f[0]);
        map.flyTo({
          center: f[0].geometry.coordinates,
          zoom: 15.5,
          padding: { bottom: 350 },
          speed: 1.2,
        });
      }
    });
  } else {
    map.on("click", "unclustered-point", (e) => {
      if (!e.features.length) return;
      openLocationSidebar(e.features[0]);
      map.flyTo({
        center: e.features[0].geometry.coordinates,
        zoom: 15.5,
        padding: { right: 400 },
        speed: 1.2,
      });
    });
    map.on("click", "unclustered-icon", (e) => {
      if (!e.features.length) return;
      openLocationSidebar(e.features[0]);
      map.flyTo({
        center: e.features[0].geometry.coordinates,
        zoom: 15.5,
        padding: { right: 400 },
        speed: 1.2,
      });
    });
    map.on("mousemove", "unclustered-point", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (e.features.length > 0) {
        if (hoveredId !== null) {
          map.setFeatureState(
            { source: "Nuisaptravel-src", id: hoveredId },
            { hover: false },
          );
        }
        hoveredId = e.features[0].id;
        map.setFeatureState(
          { source: "Nuisaptravel-src", id: hoveredId },
          { hover: true },
        );
      }
    });
    map.on("mouseleave", "unclustered-point", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: "Nuisaptravel-src", id: hoveredId },
          { hover: false },
        );
      }
      hoveredId = null;
    });
  }
}

function updateMapSourceData() {
  const src = map.getSource("Nuisaptravel-src");
  if (src)
    src.setData({
      type: "FeatureCollection",
      features: currentFilteredLocations,
    });
}

async function fetchAndRenderData() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("locations")
      .select("*, categories!locations_category_id_fkey(name)")
      .eq("status", "active");
    if (error) throw error;

    window.allLocations = (data || []).map((item) => {
      let arrUrls = ["https://placehold.co/600x400/ccc/white?text=No+Image"];
      if (item.image_urls && item.image_urls.length > 0)
        arrUrls = item.image_urls;
      else if (item.image_url) arrUrls = [item.image_url];
      return {
        id: item.id,
        type: "Feature",
        geometry: { type: "Point", coordinates: [item.lng, item.lat] },
        properties: {
          id: item.id,
          name: item.name,
          category: item.categories?.name || "Khác",
          description: item.description,
          imageUrls: JSON.stringify(arrUrls),
        },
      };
    });
    currentFilteredLocations = [...window.allLocations];

    const { data: priceData } = await supabaseClient
      .from("price_items")
      .select("*");
    window.allPriceItemsCache = priceData || [];
  } catch (e) {
    console.error("Lỗi tải dữ liệu:", e);
  }
}

// ==========================================
// 2. GPS & DẪN ĐƯỜNG OSRM (HỖ TRỢ NHIỀU ĐIỂM DỪNG)
// ==========================================
function initGeolocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        userLocation = [pos.coords.longitude, pos.coords.latitude];
        if (!userMarker && map) {
          const el = document.createElement("div");
          el.style.backgroundColor = "#2563eb";
          el.style.width = "16px";
          el.style.height = "16px";
          el.style.borderRadius = "50%";
          el.style.border = "3px solid white";
          el.style.boxShadow = "0 0 8px rgba(0,0,0,0.4)";
          userMarker = new maplibregl.Marker({ element: el })
            .setLngLat(userLocation)
            .setPopup(
              new maplibregl.Popup({ offset: 15 }).setText("Vị trí của bạn"),
            )
            .addTo(map);
        } else if (userMarker) {
          userMarker.setLngLat(userLocation);
        }
      },
      (err) => console.log("Lỗi GPS:", err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  }
}

async function drawRoute(startCoords, endCoords, mode = "driving") {
  return drawMultiStopRoute([startCoords, endCoords], mode);
}

async function drawMultiStopRoute(coordsList, mode = "driving") {
  if (!coordsList || coordsList.length < 2) return;
  const osrmProfile = mode === "walking" ? "foot" : "driving";
  const coordString = coordsList.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordString}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0].geometry;
      if (map.getSource("route-src")) map.getSource("route-src").setData(route);
      const bounds = route.coordinates.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]),
      );
      map.fitBounds(bounds, { padding: 60 });
    }
  } catch (err) {
    if (window.Toast)
      window.Toast.show("Lỗi kết nối máy chủ chỉ đường.", "error");
  }
}

// ==========================================
// 3. ĐIỀU KHIỂN MENU, BỘ LỌC
// ==========================================
document
  .getElementById("mobile-filter-toggle")
  ?.addEventListener("click", () => {
    document.getElementById("filter-menu").classList.toggle("show");
  });

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    const cat = e.currentTarget.getAttribute("data-filter");
    if (cat === "all") currentFilteredLocations = [...window.allLocations];
    else if (cat === "near-me") {
      if (!userLocation) return window.Toast?.show("Đang chờ GPS.", "info");
      currentFilteredLocations = window.allLocations
        .filter((l) => {
          l.tempDist = getDistanceFromLatLonInKm(
            userLocation[1],
            userLocation[0],
            l.geometry.coordinates[1],
            l.geometry.coordinates[0],
          );
          return l.tempDist <= 5;
        })
        .sort((a, b) => a.tempDist - b.tempDist);
    } else {
      currentFilteredLocations = window.allLocations.filter(
        (loc) => loc.properties.category === cat,
      );
    }
    updateMapSourceData();
    document.getElementById("filter-menu").classList.remove("show");
  });
});

document.getElementById("btn-street")?.addEventListener("click", (e) => {
  if (currentMapStyle === "streets") return;
  currentMapStyle = "streets";
  map.setStyle("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json");
  e.currentTarget.classList.add("active");
  document.getElementById("btn-satellite").classList.remove("active");
  setTimeout(() => addMapLayers(), 800);
});

document.getElementById("btn-satellite")?.addEventListener("click", (e) => {
  if (currentMapStyle === "satellite") return;
  currentMapStyle = "satellite";
  map.setStyle({
    version: 8,
    sources: {
      "esri-satellite": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "satellite",
        type: "raster",
        source: "esri-satellite",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  });
  e.currentTarget.classList.add("active");
  document.getElementById("btn-street").classList.remove("active");
  setTimeout(() => addMapLayers(), 800);
});

// ==========================================
// 4. SIDEBAR CHI TIẾT ĐỊA ĐIỂM
// ==========================================
const sidebar = document.getElementById("info-sidebar");
let touchStartY = 0;
sidebar?.addEventListener(
  "touchstart",
  (e) => (touchStartY = e.changedTouches[0].screenY),
  { passive: true },
);
sidebar?.addEventListener(
  "touchend",
  (e) => {
    if (e.changedTouches[0].screenY - touchStartY > 100) closeSidebar();
  },
  { passive: true },
);
document
  .getElementById("close-sidebar")
  ?.addEventListener("click", closeSidebar);

function closeSidebar() {
  sidebar.classList.remove("open");
  if (synth.speaking) synth.cancel();
  updateAudioBtnUI(false);
  resetReviewForm();
}

function openLocationSidebar(feature) {
  activeLocationId = feature.id || feature.properties.id;
  activeLocationName = feature.properties.name || "";

  loadLocationReviews(activeLocationId);
  loadLocationPrices(activeLocationId);

  document.getElementById("sb-title").textContent = feature.properties.name;
  document.getElementById("sb-category").textContent =
    feature.properties.category;
  document.getElementById("sb-desc").textContent =
    feature.properties.description;

  const distanceTag = document.getElementById("sb-distance");
  if (userLocation) {
    const dist = getDistanceFromLatLonInKm(
      userLocation[1],
      userLocation[0],
      feature.geometry.coordinates[1],
      feature.geometry.coordinates[0],
    );
    distanceTag.style.display = "inline-block";
    distanceTag.innerHTML = `<i class="fa-solid fa-location-arrow"></i> Cách ${dist.toFixed(1)} km`;
  } else {
    distanceTag.style.display = "none";
  }

  let images = ["https://placehold.co/600x400/ccc/white?text=No+Image"];
  try {
    if (feature.properties.imageUrls)
      images = JSON.parse(feature.properties.imageUrls);
  } catch (e) {}

  const carouselContainer = document.getElementById("sb-carousel");
  const prevBtn = document.getElementById("sb-carousel-prev");
  const nextBtn = document.getElementById("sb-carousel-next");
  const indContainer = document.getElementById("sb-carousel-indicators");
  carouselContainer.innerHTML = "";
  indContainer.innerHTML = "";

  images.forEach((url, index) => {
    const safeSrc =
      sanitizeUrl(url) ||
      "https://placehold.co/600x400/ccc/white?text=No+Image";
    const img = document.createElement("img");
    img.src = safeSrc;
    carouselContainer.appendChild(img);
    const ind = document.createElement("div");
    ind.className = `indicator ${index === 0 ? "active" : ""}`;
    indContainer.appendChild(ind);
  });

  let currentSlide = 0;
  if (images.length > 1) {
    prevBtn.style.display = "flex";
    nextBtn.style.display = "flex";
    indContainer.style.display = "flex";
  } else {
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    indContainer.style.display = "none";
  }

  const updateSlider = () => {
    carouselContainer.style.transform = `translateX(-${currentSlide * 100}%)`;
    Array.from(indContainer.children).forEach((dot, idx) =>
      dot.classList.toggle("active", idx === currentSlide),
    );
  };
  prevBtn.onclick = () => {
    currentSlide = currentSlide > 0 ? currentSlide - 1 : images.length - 1;
    updateSlider();
  };
  nextBtn.onclick = () => {
    currentSlide = currentSlide < images.length - 1 ? currentSlide + 1 : 0;
    updateSlider();
  };
  Array.from(indContainer.children).forEach(
    (dot, idx) =>
      (dot.onclick = () => {
        currentSlide = idx;
        updateSlider();
      }),
  );

  updateBookmarkButtonUI();

  if (synth.speaking) synth.cancel();
  updateAudioBtnUI(false);
  document.getElementById("btn-audio").onclick = () => {
    if (synth.speaking && !synth.paused) {
      synth.pause();
      updateAudioBtnUI(false);
    } else if (synth.paused) {
      synth.resume();
      updateAudioBtnUI(true);
    } else {
      const textToRead = document.getElementById("sb-desc").textContent;
      if (!textToRead) return;
      currentUtterance = new SpeechSynthesisUtterance(textToRead);
      currentUtterance.lang = "vi-VN";
      currentUtterance.onend = () => updateAudioBtnUI(false);
      currentUtterance.onerror = () => updateAudioBtnUI(false);
      synth.speak(currentUtterance);
      updateAudioBtnUI(true);
    }
  };

  document.getElementById("btn-directions").onclick = () => {
    if (userLocation) {
      drawRoute(userLocation, feature.geometry.coordinates);
      if (window.innerWidth <= 768) closeSidebar();
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}`,
        "_blank",
      );
    }
  };

  const btnCheckin = document.getElementById("btn-checkin");
  btnCheckin.onclick = async () => {
    if (!currentAuthUser)
      return window.Toast?.show("Cần đăng nhập để Check-in!", "info");
    if (!userLocation)
      return window.Toast?.show("Đang dò tọa độ GPS...", "info");
    btnCheckin.disabled = true;
    btnCheckin.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    try {
      const { data, error } = await supabaseClient.rpc("perform_check_in", {
        p_location_id: activeLocationId,
        p_lat: userLocation[1],
        p_lng: userLocation[0],
      });
      if (error) throw error;
      if (data.success) {
        window.AlertModal
          ? window.AlertModal.show("Thành Công!", data.message, "success")
          : window.Toast?.show(data.message, "success");
      } else {
        window.AlertModal
          ? window.AlertModal.show("Chưa đạt yêu cầu", data.message, "error")
          : window.Toast?.show(data.message, "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      btnCheckin.disabled = false;
      btnCheckin.innerHTML = `<i class="fa-solid fa-map-pin"></i> Check-in`;
    }
  };

  sidebar.classList.add("open");
}

function updateBookmarkButtonUI() {
  const btn = document.getElementById("btn-bookmark");
  if (!btn) return;
  if (userBookmarkedIds.includes(activeLocationId)) {
    btn.classList.add("active");
    btn.innerHTML = `<i class="fa-solid fa-bookmark"></i> Đã lưu`;
  } else {
    btn.classList.remove("active");
    btn.innerHTML = `<i class="fa-regular fa-bookmark"></i> Lưu`;
  }
}

document.getElementById("btn-bookmark")?.addEventListener("click", async () => {
  if (!currentAuthUser) return window.Toast?.show("Cần đăng nhập!", "info");
  const btn = document.getElementById("btn-bookmark");
  const isBookmarked = userBookmarkedIds.includes(activeLocationId);
  btn.disabled = true;
  if (isBookmarked) {
    const { error } = await supabaseClient
      .from("user_bookmarks")
      .delete()
      .eq("user_id", currentAuthUser.id)
      .eq("location_id", activeLocationId);
    if (!error)
      userBookmarkedIds = userBookmarkedIds.filter(
        (id) => id !== activeLocationId,
      );
  } else {
    const { error } = await supabaseClient
      .from("user_bookmarks")
      .insert([{ user_id: currentAuthUser.id, location_id: activeLocationId }]);
    if (!error) userBookmarkedIds.push(activeLocationId);
  }
  btn.disabled = false;
  updateBookmarkButtonUI();
});

// ==========================================
// 5. TÌM KIẾM THÔNG MINH & GIỌNG NÓI
// ==========================================
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const voiceBtn = document.getElementById("voice-search-btn");

function removeVietnameseTones(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function getLevenshteinDistance(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
  return m[b.length][a.length];
}
function getFuzzyDistance(searchKey, target) {
  if (searchKey.length >= target.length)
    return getLevenshteinDistance(searchKey, target);
  let min = Infinity;
  for (let i = 0; i <= target.length - searchKey.length; i++) {
    const dist = getLevenshteinDistance(
      searchKey,
      target.substring(i, i + searchKey.length),
    );
    if (dist < min) min = dist;
  }
  return min;
}

function handleSearchInput(val) {
  if (!val || !window.allLocations) {
    searchResults.style.display = "none";
    return;
  }
  const searchKey = removeVietnameseTones(val);
  const exact = window.allLocations.filter(
    (l) =>
      removeVietnameseTones(l.properties.name).includes(searchKey) ||
      removeVietnameseTones(l.properties.category).includes(searchKey),
  );
  const matches =
    exact.length > 0
      ? exact
      : searchKey.length > 3
        ? window.allLocations
            .map((l) => ({
              ...l,
              fuzzyScore: getFuzzyDistance(
                searchKey,
                removeVietnameseTones(l.properties.name),
              ),
            }))
            .filter((l) => l.fuzzyScore <= 2)
            .sort((a, b) => a.fuzzyScore - b.fuzzyScore)
            .slice(0, 3)
        : [];

  if (matches.length > 0) {
    searchResults.innerHTML =
      exact.length === 0
        ? `<li style="font-size:12px; color:#ef4444; background:#fef2f2; pointer-events:none;">Có phải bạn muốn tìm:</li>`
        : "";
    searchResults.style.display = "block";
    matches.forEach((loc) => {
      const li = document.createElement("li");
      li.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#64748b;"></i> <div><span style="font-weight:600; display:block;">${escapeHTML(
        loc.properties.name,
      )}</span><span style="font-size: 11px; color:#64748b;">${escapeHTML(
        loc.properties.category,
      )}</span></div>`;
      li.onclick = () => {
        map.flyTo({ center: loc.geometry.coordinates, zoom: 15.5 });
        openLocationSidebar(loc);
        searchResults.style.display = "none";
        searchInput.value = loc.properties.name;
      };
      searchResults.appendChild(li);
    });
  } else searchResults.style.display = "none";
}

searchInput?.addEventListener("input", (e) =>
  handleSearchInput(e.target.value),
);
document.addEventListener("click", (e) => {
  if (!e.target.closest("#search-container"))
    searchResults.style.display = "none";
});

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition && voiceBtn) {
  const recognition = new SpeechRecognition();
  recognition.lang = "vi-VN";
  recognition.interimResults = false;
  let isListening = false;
  const resetVoiceUI = () => {
    isListening = false;
    voiceBtn.classList.remove("listening");
    searchInput.placeholder = "Tìm địa điểm...";
  };
  voiceBtn.onclick = () => {
    if (isListening) {
      recognition.abort();
      resetVoiceUI();
    } else recognition.start();
  };
  recognition.onstart = () => {
    isListening = true;
    voiceBtn.classList.add("listening");
    searchInput.placeholder = "Đang nghe...";
    searchInput.value = "";
  };
  recognition.onend = resetVoiceUI;
  recognition.onresult = (e) => {
    searchInput.value = e.results[0][0].transcript;
    handleSearchInput(searchInput.value);
    resetVoiceUI();
  };
  recognition.onerror = (e) => {
    resetVoiceUI();
    if (e.error !== "aborted" && window.Toast)
      window.Toast.show(
        e.error === "not-allowed" ? "Cấp quyền Micro!" : "Không nghe rõ.",
        "error",
      );
  };
}

// ==========================================
// 6. XÁC THỰC, BẢNG GIÁ CỘNG ĐỒNG & ĐÁNH GIÁ
// ==========================================
async function checkGlobalAuth() {
  if (!supabaseClient) return;
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    if (session) {
      currentAuthUser = session.user;

      const nameInput = document.getElementById("reviewer-name");
      if (nameInput) {
        nameInput.value =
          currentAuthUser.user_metadata?.full_name ||
          currentAuthUser.email.split("@")[0];
        nameInput.readOnly = true;
      }

      const { data: bmData } = await supabaseClient
        .from("user_bookmarks")
        .select("location_id")
        .eq("user_id", currentAuthUser.id);
      if (bmData) userBookmarkedIds = bmData.map((d) => d.location_id);

      const { data: profileData } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", currentAuthUser.id)
        .maybeSingle();

      if (
        profileData &&
        (profileData.role === "admin" || profileData.role === "manager")
      ) {
        const btnAdmin = document.getElementById("btn-admin");
        const adminSep = document.getElementById("admin-separator");
        if (btnAdmin) btnAdmin.style.display = "flex";
        if (adminSep) adminSep.style.display = "block";
      }
    }
  } catch (error) {
    console.error("Lỗi xác thực:", error);
  }
}

async function loadLocationPrices(locId) {
  const container = document.getElementById("sb-prices");
  if (!container) return;
  container.innerHTML =
    '<div style="text-align:center; padding: 10px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu giá...</div>';

  try {
    const [listedRes, communityRes] = await Promise.all([
      supabaseClient
        .from("price_items")
        .select("*")
        .eq("location_id", locId)
        .order("updated_at", { ascending: false }),
      supabaseClient
        .from("community_price_reports")
        .select("*")
        .eq("location_id", locId)
        .eq("is_test_data", false),
    ]);

    if (listedRes.error) throw listedRes.error;
    const listedItems = listedRes.data || [];
    const communityReports = communityRes.data || [];
    activeLocationPriceItems = listedItems;

    populatePriceDropdowns(listedItems);

    if (listedItems.length === 0) {
      container.innerHTML = `
        <div class="price-container">
          <div class="price-header"><i class="fa-solid fa-tag"></i> Bảng giá & Xác minh cộng đồng</div>
          <p style="font-size: 13px; color: #64748b; margin: 0;">
            Chưa có bảng giá niêm yết từ cơ sở. Bạn có thể đóng góp giá thực trả đầu tiên bên dưới!
          </p>
        </div>`;
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "price-container";
    wrapper.innerHTML = `
      <div class="price-header" style="justify-content: space-between;">
        <span><i class="fa-solid fa-tag" style="color:#0052cc;"></i> Giá niêm yết & Thực trả</span>
        <span style="font-size:11px; font-weight:normal; color:#64748b;">Mẫu 90 ngày gần nhất</span>
      </div>`;

    const fmt = (v) =>
      window.Phase2Engine
        ? window.Phase2Engine.formatCurrency(v)
        : new Intl.NumberFormat("vi-VN").format(v);
    const condMap = window.Phase2Engine?.CONFIG.CONDITION_LABELS || {};

    listedItems.forEach((item) => {
      const evalResult = window.Phase2Engine
        ? window.Phase2Engine.evaluatePriceItem(item, communityReports)
        : {
            verifiedCount: 0,
            unverifiedCount: 0,
            status: "no_data",
            statusMessage: "",
          };

      const isOld =
        Math.floor((new Date() - new Date(item.updated_at)) / 86400000) > 90;
      const priceText =
        Number(item.price_min) === Number(item.price_max)
          ? fmt(item.price_min)
          : `${fmt(item.price_min)} - ${fmt(item.price_max)}`;

      const condLabel =
        condMap[item.condition_type || "normal"] || "Ngày thường";

      let communityHtml = "";
      if (evalResult.verifiedCount > 0) {
        communityHtml = `
          <div class="price-stats-sub">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><strong>Trung vị thực trả (Đã xác minh):</strong></span>
              <span style="color:#059669; font-weight:700;">${fmt(evalResult.medianPrice)} ${escapeHTML(item.unit)}</span>
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:3px;">
              Số mẫu hợp lệ: <strong>${evalResult.verifiedCount}</strong> (${escapeHTML(evalResult.dateRangeText)})
              ${evalResult.unverifiedCount > 0 ? ` • Chờ duyệt: ${evalResult.unverifiedCount}` : ""}
            </div>
            <div class="price-badge-status ${evalResult.status}">
              ${
                evalResult.status === "warning_high"
                  ? '<i class="fa-solid fa-triangle-exclamation"></i>'
                  : evalResult.status === "normal"
                    ? '<i class="fa-solid fa-circle-check"></i>'
                    : '<i class="fa-solid fa-circle-info"></i>'
              }
              ${escapeHTML(evalResult.statusMessage)}
            </div>
          </div>`;
      } else {
        communityHtml = `
          <div class="price-stats-sub" style="background:#f8fafc;">
            <span style="font-size:11px; color:#64748b;">
              <i class="fa-regular fa-clock"></i> Chưa có mẫu xác minh${
                evalResult.unverifiedCount > 0
                  ? ` (Có ${evalResult.unverifiedCount} phản hồi đang chờ duyệt)`
                  : ""
              }.
            </span>
          </div>`;
      }

      const itemBlock = document.createElement("div");
      itemBlock.className = "price-item-block";
      itemBlock.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div>
            <span class="price-name" style="${isOld ? "text-decoration:line-through;color:#94a3b8;" : ""}">
              ${escapeHTML(item.item_name)}
            </span>
            <span style="font-size:11px; color:#64748b; background:#e2e8f0; padding:1px 6px; border-radius:10px; margin-left:4px;">
              ${escapeHTML(condLabel)}
            </span>
          </div>
          <span class="price-value">
            ${priceText} <span class="price-unit">${escapeHTML(item.unit)}</span>
          </span>
        </div>
        ${communityHtml}
      `;
      wrapper.appendChild(itemBlock);
    });

    container.innerHTML = "";
    container.appendChild(wrapper);
  } catch (err) {
    console.error("Lỗi tải bảng giá:", err);
    container.innerHTML = "";
  }
}

function populatePriceDropdowns(listedItems) {
  const cpSelect = document.getElementById("cp-service-select");
  const drSelect = document.getElementById("dr-service-select");
  if (!cpSelect || !drSelect) return;

  cpSelect.innerHTML =
    '<option value="">-- Tự nhập tên dịch vụ khác --</option>';
  drSelect.innerHTML =
    '<option value="">-- Chọn dịch vụ hoặc nhập bên dưới --</option>';

  (listedItems || []).forEach((item) => {
    const opt1 = document.createElement("option");
    opt1.value = item.id;
    opt1.textContent = `${item.item_name} (${item.unit})`;
    opt1.dataset.name = item.item_name;
    opt1.dataset.unit = item.unit;
    opt1.dataset.max = item.price_max;
    cpSelect.appendChild(opt1);

    const opt2 = opt1.cloneNode(true);
    drSelect.appendChild(opt2);
  });
}

async function loadLocationReviews(locId) {
  const listEl = document.getElementById("reviews-list");
  const countEl = document.getElementById("review-count");
  if (!listEl) return;
  listEl.innerHTML =
    '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  try {
    const { data } = await supabaseClient
      .from("reviews")
      .select("*")
      .eq("location_id", locId)
      .order("created_at", { ascending: false });
    const reviews = data || [];
    countEl.textContent = reviews.length;
    if (reviews.length === 0) {
      listEl.innerHTML =
        "<p style='color:#64748b; font-size:14px;'>Chưa có đánh giá.</p>";
      return;
    }

    listEl.innerHTML = "";
    reviews.forEach((r) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "review-item";

      const ratingCount = Math.min(5, Math.max(1, parseInt(r.rating) || 5));
      itemDiv.innerHTML = `
        <div class="review-header">
          <span class="reviewer-name">${escapeHTML(r.guest_name)}</span>
          <span class="review-stars">${"⭐".repeat(ratingCount)}</span>
        </div>
        <p class="review-comment">${escapeHTML(r.comment)}</p>
      `;

      if (r.image_url) {
        let urls = [];
        try {
          const parsed = JSON.parse(r.image_url);
          urls = Array.isArray(parsed) ? parsed : [r.image_url];
        } catch (e) {
          urls = [r.image_url];
        }

        const validUrls = urls
          .map((u) => sanitizeUrl(u))
          .filter((u) => u !== "");
        if (validUrls.length > 0) {
          const grid = document.createElement("div");
          grid.className = "review-images-grid";
          validUrls.forEach((safeUrl) => {
            const img = document.createElement("img");
            img.src = safeUrl;
            img.className = "review-image-display";
            img.style.marginTop = "0";
            img.style.cursor = "pointer";
            img.addEventListener("click", () =>
              window.open(safeUrl, "_blank", "noopener,noreferrer"),
            );
            grid.appendChild(img);
          });
          itemDiv.appendChild(grid);
        }
      }

      listEl.appendChild(itemDiv);
    });
  } catch (e) {
    listEl.innerHTML = "Lỗi tải đánh giá.";
  }
}

let selectedReviewFiles = [];

function resetReviewForm() {
  const reviewText = document.getElementById("review-text");
  const reviewRating = document.getElementById("review-rating");
  const fileNameSpan = document.getElementById("review-file-name");

  if (reviewText) reviewText.value = "";
  if (reviewRating) reviewRating.value = "5";
  selectedReviewFiles = [];
  renderReviewImagePreviews();

  if (fileNameSpan) fileNameSpan.textContent = "Đính kèm ảnh (Tùy chọn)";
}

function renderReviewImagePreviews() {
  const container = document.getElementById("review-image-preview-container");
  if (!container) return;
  container.innerHTML = "";

  selectedReviewFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrap = document.createElement("div");
      wrap.className = "review-img-wrap";
      const img = document.createElement("img");
      img.src = e.target.result;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove-review-img-btn";
      btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      btn.onclick = () => {
        selectedReviewFiles.splice(index, 1);
        renderReviewImagePreviews();
        const fileNameSpan = document.getElementById("review-file-name");
        if (fileNameSpan) {
          fileNameSpan.textContent =
            selectedReviewFiles.length > 0
              ? `Đã chọn ${selectedReviewFiles.length} ảnh`
              : "Đính kèm ảnh (Tùy chọn)";
        }
      };
      wrap.appendChild(img);
      wrap.appendChild(btn);
      container.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

const reviewImgInput = document.getElementById("review-image");
reviewImgInput?.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  selectedReviewFiles = selectedReviewFiles.concat(files);

  const fileNameSpan = document.getElementById("review-file-name");
  if (fileNameSpan) {
    fileNameSpan.textContent =
      selectedReviewFiles.length > 0
        ? `Đã chọn ${selectedReviewFiles.length} ảnh`
        : "Đính kèm ảnh (Tùy chọn)";
  }

  renderReviewImagePreviews();
  e.target.value = "";
});

document
  .getElementById("submit-review-btn")
  ?.addEventListener("click", async () => {
    if (!activeLocationId) return;
    const btn = document.getElementById("submit-review-btn");
    const name = document.getElementById("reviewer-name").value.trim();
    const comment = document.getElementById("review-text").value.trim();

    if (!navigator.onLine)
      return window.Toast?.show("Mất kết nối mạng!", "error");
    if (!name || !comment)
      return window.Toast?.show("Vui lòng nhập tên và bình luận!", "info");

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    let uploadedUrls = [];

    if (selectedReviewFiles.length > 0) {
      document.getElementById("review-upload-status").style.display = "block";
      const uploadPromises = selectedReviewFiles.map(async (file) => {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error } = await supabaseClient.storage
          .from("review-images")
          .upload(fileName, file);
        if (!error) {
          return supabaseClient.storage
            .from("review-images")
            .getPublicUrl(fileName).data.publicUrl;
        }
        return null;
      });

      const results = await Promise.all(uploadPromises);
      uploadedUrls = results.filter((url) => url !== null);
      document.getElementById("review-upload-status").style.display = "none";
    }

    const finalImageUrlStr =
      uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null;

    const { error } = await supabaseClient.from("reviews").insert([
      {
        location_id: activeLocationId,
        guest_name: name,
        rating: parseInt(document.getElementById("review-rating").value) || 5,
        comment: comment,
        user_id: currentAuthUser?.id || null,
        image_url: finalImageUrlStr,
      },
    ]);

    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi Đánh Giá';
    btn.disabled = false;

    if (!error) {
      resetReviewForm();
      loadLocationReviews(activeLocationId);
      window.Toast?.show("Cảm ơn đánh giá của bạn!", "success");
    } else {
      window.Toast?.show("Lỗi: " + error.message, "error");
    }
  });

// ==========================================
// 7. PHASE 2 EVENTS: GỬI GIÁ THỰC TRẢ & BÁO CÁO GIÁ SAI
// ==========================================
const todayStr = new Date().toISOString().split("T")[0];
if (document.getElementById("cp-transaction-date")) {
  document.getElementById("cp-transaction-date").value = todayStr;
  document.getElementById("cp-transaction-date").max = todayStr;
}
if (document.getElementById("dr-incident-date")) {
  document.getElementById("dr-incident-date").value = todayStr;
  document.getElementById("dr-incident-date").max = todayStr;
}

document
  .getElementById("btn-open-actual-price")
  ?.addEventListener("click", () => {
    if (!currentAuthUser) {
      return window.Toast?.show(
        "Vui lòng đăng nhập tại mục Hồ sơ để gửi giá thực trả!",
        "info",
      );
    }
    document.getElementById("actual-price-modal").classList.add("active");
  });
document
  .getElementById("close-actual-price-modal")
  ?.addEventListener("click", () => {
    document.getElementById("actual-price-modal").classList.remove("active");
  });

document
  .getElementById("cp-service-select")
  ?.addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.value) {
      document.getElementById("cp-service-name").value = opt.dataset.name || "";
      document.getElementById("cp-service-unit").value = opt.dataset.unit || "";
    }
  });

document.getElementById("cp-receipt-file")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  const label = document.getElementById("cp-receipt-label");
  if (label) {
    label.textContent = file
      ? `Đã chọn: ${file.name}`
      : "Đính kèm ảnh hóa đơn / bảng giá (Tùy chọn)";
  }
});

document
  .getElementById("btn-submit-actual-price")
  ?.addEventListener("click", async () => {
    if (!currentAuthUser || !activeLocationId) return;
    const priceItemId =
      document.getElementById("cp-service-select").value || null;
    const serviceName = document.getElementById("cp-service-name").value.trim();
    const unit = document.getElementById("cp-service-unit").value.trim();
    const actualPrice = parseFloat(
      document.getElementById("cp-actual-price").value,
    );
    const txDate =
      document.getElementById("cp-transaction-date").value || todayStr;
    const condType =
      document.getElementById("cp-condition-type").value || "normal";
    const receiptFile = document.getElementById("cp-receipt-file")?.files[0];

    if (!serviceName || !unit || isNaN(actualPrice) || actualPrice < 0) {
      return window.Toast?.show(
        "Vui lòng điền đầy đủ tên dịch vụ, đơn vị và số tiền hợp lệ!",
        "info",
      );
    }

    const btn = document.getElementById("btn-submit-actual-price");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';

    try {
      let receiptUrl = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop();
        const path = `receipts/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: upErr } = await supabaseClient.storage
          .from("review-images")
          .upload(path, receiptFile);
        if (!upErr) {
          receiptUrl = supabaseClient.storage
            .from("review-images")
            .getPublicUrl(path).data.publicUrl;
        }
      }

      const { error } = await supabaseClient
        .from("community_price_reports")
        .insert([
          {
            location_id: activeLocationId,
            price_item_id: priceItemId ? parseInt(priceItemId) : null,
            service_name: serviceName,
            unit: unit,
            actual_price: actualPrice,
            transaction_date: txDate,
            condition_type: condType,
            user_id: currentAuthUser.id,
            receipt_url: receiptUrl,
          },
        ]);

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "Bạn đã gửi giá cho dịch vụ này trong ngày hôm nay rồi.",
          );
        }
        throw error;
      }

      window.Toast?.show(
        "Đã ghi nhận giá thực trả! Dữ liệu đang chờ kiểm duyệt.",
        "success",
      );
      document.getElementById("actual-price-modal").classList.remove("active");
      document.getElementById("cp-actual-price").value = "";
      document.getElementById("cp-receipt-file").value = "";
      document.getElementById("cp-receipt-label").textContent =
        "Đính kèm ảnh hóa đơn / bảng giá (Tùy chọn)";
      loadLocationPrices(activeLocationId);
    } catch (err) {
      window.Toast?.show(err.message || "Lỗi khi gửi dữ liệu.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML =
        '<i class="fa-solid fa-check-circle"></i> Gửi dữ liệu xác minh';
    }
  });

document
  .getElementById("btn-open-discrepancy-report")
  ?.addEventListener("click", () => {
    if (!currentAuthUser) {
      return window.Toast?.show(
        "Vui lòng đăng nhập tại mục Hồ sơ để gửi báo cáo!",
        "info",
      );
    }
    document.getElementById("discrepancy-modal").classList.add("active");
  });
document
  .getElementById("close-discrepancy-modal")
  ?.addEventListener("click", () => {
    document.getElementById("discrepancy-modal").classList.remove("active");
  });

document
  .getElementById("dr-service-select")
  ?.addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.value) {
      document.getElementById("dr-service-name").value = opt.dataset.name || "";
      document.getElementById("dr-listed-price").value = opt.dataset.max || "";
    }
  });

document
  .getElementById("dr-evidence-files")
  ?.addEventListener("change", (e) => {
    const count = e.target.files.length;
    const label = document.getElementById("dr-evidence-label");
    if (label) {
      label.textContent =
        count > 0
          ? `Đã chọn ${count} ảnh bằng chứng`
          : "Đính kèm ảnh bằng chứng / hóa đơn (Tùy chọn)";
    }
  });

document
  .getElementById("btn-submit-discrepancy")
  ?.addEventListener("click", async () => {
    if (!currentAuthUser || !activeLocationId) return;
    const priceItemId =
      document.getElementById("dr-service-select").value || null;
    const serviceName = document.getElementById("dr-service-name").value.trim();
    const listedPriceRaw = document.getElementById("dr-listed-price").value;
    const chargedPrice = parseFloat(
      document.getElementById("dr-charged-price").value,
    );
    const incidentDate =
      document.getElementById("dr-incident-date").value || todayStr;
    const condType =
      document.getElementById("dr-condition-type").value || "normal";
    const desc = document.getElementById("dr-description").value.trim();
    const files = Array.from(
      document.getElementById("dr-evidence-files")?.files || [],
    );

    if (
      !serviceName ||
      isNaN(chargedPrice) ||
      chargedPrice < 0 ||
      desc.length < 10
    ) {
      return window.Toast?.show(
        "Vui lòng nhập tên dịch vụ, giá bị thu và mô tả tối thiểu 10 ký tự!",
        "info",
      );
    }

    const btn = document.getElementById("btn-submit-discrepancy");
    btn.disabled = true;
    btn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi báo cáo...';

    try {
      let evidenceUrls = [];
      if (files.length > 0) {
        const upPromises = files.map(async (file) => {
          const ext = file.name.split(".").pop();
          const path = `reports/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
          const { error: upErr } = await supabaseClient.storage
            .from("review-images")
            .upload(path, file);
          if (!upErr) {
            return supabaseClient.storage
              .from("review-images")
              .getPublicUrl(path).data.publicUrl;
          }
          return null;
        });
        evidenceUrls = (await Promise.all(upPromises)).filter(
          (u) => u !== null,
        );
      }

      const { error } = await supabaseClient
        .from("price_discrepancy_reports")
        .insert([
          {
            location_id: activeLocationId,
            price_item_id: priceItemId ? parseInt(priceItemId) : null,
            service_name: serviceName,
            listed_price:
              listedPriceRaw !== "" ? parseFloat(listedPriceRaw) : null,
            charged_price: chargedPrice,
            condition_type: condType,
            incident_date: incidentDate,
            description: desc,
            evidence_urls: evidenceUrls,
            reporter_id: currentAuthUser.id,
          },
        ]);

      if (error) throw error;

      window.Toast?.show(
        "Đã gửi báo cáo thành công! Ban quản trị sẽ xác minh.",
        "success",
      );
      document.getElementById("discrepancy-modal").classList.remove("active");
      document.getElementById("dr-description").value = "";
      document.getElementById("dr-charged-price").value = "";
      document.getElementById("dr-evidence-files").value = "";
      document.getElementById("dr-evidence-label").textContent =
        "Đính kèm ảnh bằng chứng / hóa đơn (Tùy chọn)";
    } catch (err) {
      window.Toast?.show(err.message || "Lỗi khi gửi báo cáo.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML =
        '<i class="fa-solid fa-paper-plane"></i> Gửi Báo Cáo Vi Phạm';
    }
  });

// ==========================================
// 8. HỢP NHẤT: LẬP LỘ TRÌNH & DỰ TOÁN CHI PHÍ CHUYẾN ĐI
// ==========================================
document.getElementById("btn-open-itinerary")?.addEventListener("click", () => {
  document.getElementById("itinerary-modal")?.classList.add("active");
});
document
  .getElementById("close-itinerary-modal")
  ?.addEventListener("click", () => {
    document.getElementById("itinerary-modal")?.classList.remove("active");
  });

async function computeUnifiedPlanAndRender() {
  if (!window.Phase2Engine) return null;

  if (window.allPriceItemsCache.length === 0 && supabaseClient) {
    const { data } = await supabaseClient.from("price_items").select("*");
    window.allPriceItemsCache = data || [];
  }

  const prefs = Array.from(document.querySelectorAll(".iti-pref:checked")).map(
    (cb) => cb.value,
  );
  if (prefs.length === 0) {
    window.Toast?.show(
      "Vui lòng chọn ít nhất 1 loại địa điểm muốn ghé thăm!",
      "info",
    );
    return null;
  }

  const companion =
    document.querySelector('input[name="iti_companion"]:checked')?.value ||
    "friends";
  const startPoint = userLocation || [105.267768, 10.262644];

  const params = {
    people: document.getElementById("bg-people")?.value || 2,
    days: document.getElementById("bg-days")?.value || 1,
    mealsPerDay: document.getElementById("bg-meals")?.value || 2,
    needStay: document.getElementById("bg-stay")?.value === "true",
    maxBudget: document.getElementById("bg-max-budget")?.value || 0,
    preferences: prefs,
    companion: companion,
    userLocation: startPoint,
  };

  const result = window.Phase2Engine.calculateTripBudget(
    params,
    window.allLocations,
    window.allPriceItemsCache,
  );
  lastPlannedResult = result;

  const fmt = (v) => window.Phase2Engine.formatCurrency(v);
  const resContainer = document.getElementById("budget-result-container");
  if (!resContainer) return result;
  resContainer.style.display = "block";

  const budgetCheckHtml =
    result.withinUserBudget === null
      ? ""
      : result.withinUserBudget
        ? `<div style="font-size:12px; color:#15803d; font-weight:700; margin-top:4px;"><i class="fa-solid fa-circle-check"></i> Phù hợp với ngân sách dự kiến của đoàn</div>`
        : `<div style="font-size:12px; color:#b91c1c; font-weight:700; margin-top:4px;"><i class="fa-solid fa-circle-exclamation"></i> Vượt ngân sách dự kiến tối đa của đoàn</div>`;

  const breakdownHtml = result.breakdown
    .map(
      (b) => `
      <div class="budget-breakdown-item">
        <div>
          <strong style="color:#1e293b;">${escapeHTML(b.category)}</strong>
          <span style="display:block; font-size:11px; color:${b.hasData ? "#64748b" : "#d97706"};">
            ${escapeHTML(b.detail)}
          </span>
        </div>
        <div style="font-weight:700; color:#0052cc; white-space:nowrap;">
          ${b.hasData ? `${fmt(b.min)} - ${fmt(b.max)} đ` : "Chưa có dữ liệu"}
        </div>
      </div>`,
    )
    .join("");

  const missingHtml = result.missingDataNotes
    .map((note) => `<li style="margin-bottom:4px;">${escapeHTML(note)}</li>`)
    .join("");

  const dayLabel =
    result.days < 0.5
      ? "2 Tiếng"
      : result.days === 0.5
        ? "Nửa ngày"
        : `${result.days} Ngày`;

  resContainer.innerHTML = `
    <div class="budget-summary-box">
      <div class="budget-range-title">Tổng chi phí dự kiến (${result.people} người • ${dayLabel})</div>
      <div class="budget-range-value">${fmt(result.totalMin)} - ${fmt(result.totalMax)} VNĐ</div>
      <div style="font-size:12px; color:#047857;">
        Trung bình: <strong>${fmt(result.perPersonMin)} - ${fmt(result.perPersonMax)} đ / người</strong>
      </div>
      ${budgetCheckHtml}
    </div>

    <h4 style="font-size:13px; margin: 10px 0 6px; color:#1e293b;">1. Chi tiết các khoản chi phí:</h4>
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-bottom:12px;">
      ${breakdownHtml}
    </div>

    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 12px; font-size:12px; color:#92400e; margin-bottom:12px;">
      <strong><i class="fa-solid fa-circle-info"></i> Lưu ý phạm vi dữ liệu:</strong>
      <ul style="margin:6px 0 0 18px; padding:0;">${missingHtml}</ul>
    </div>

    <h4 style="font-size:13px; margin: 10px 0 6px; color:#1e293b;">
      2. Lộ trình điểm dừng gợi ý (${result.recommendedLocations.length} điểm):
    </h4>
    <div id="budget-rec-list"></div>
    <p style="font-size:11px; color:#64748b; font-style:italic; margin-top:6px;">
      * ${escapeHTML(result.algorithmLimitation)}
    </p>
  `;

  const recListEl = document.getElementById("budget-rec-list");
  if (result.recommendedLocations.length === 0) {
    recListEl.innerHTML =
      "<p style='font-size:12px; color:#64748b;'>Không tìm thấy điểm dừng phù hợp với bộ lọc và ngân sách này.</p>";
  } else {
    result.recommendedLocations.forEach((rec) => {
      const div = document.createElement("div");
      div.className = "budget-rec-item";
      const costText = rec.hasPriceData
        ? `${fmt(rec.minCostPerUnit)} - ${fmt(rec.maxCostPerUnit)} đ`
        : "Chưa niêm yết giá";
      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="itinerary-marker" style="position:static; width:24px; height:24px; font-size:12px; flex-shrink:0;">${rec.stepOrder || 1}</span>
          <div>
            <strong style="font-size:13px; color:#0f172a;">${escapeHTML(rec.name)}</strong>
            <span style="display:block; font-size:11px; color:#64748b;">
              ${escapeHTML(rec.category)} • Cách ${rec.legDistanceKm ?? rec.distanceKm ?? 0} km
            </span>
          </div>
        </div>
        <span style="font-size:12px; font-weight:700; color:#059669; white-space:nowrap;">${costText}</span>
      `;
      div.onclick = () => {
        document.getElementById("itinerary-modal")?.classList.remove("active");
        const targetLoc = window.allLocations.find(
          (l) => Number(l.id) === Number(rec.id),
        );
        if (targetLoc) {
          map.flyTo({ center: targetLoc.geometry.coordinates, zoom: 15.5 });
          openLocationSidebar(targetLoc);
        }
      };
      recListEl.appendChild(div);
    });
  }

  return result;
}

document
  .getElementById("btn-calc-budget")
  ?.addEventListener("click", async () => {
    await computeUnifiedPlanAndRender();
  });

document
  .getElementById("btn-generate-route")
  ?.addEventListener("click", async () => {
    const btnGen = document.getElementById("btn-generate-route");
    btnGen.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang vẽ...';
    btnGen.disabled = true;

    try {
      const result = await computeUnifiedPlanAndRender();
      if (!result || result.recommendedLocations.length === 0) {
        return;
      }

      const startPoint = userLocation || [105.267768, 10.262644];
      if (!userLocation && window.Toast) {
        window.Toast.show(
          "Đang lấy trung tâm Núi Sập làm điểm xuất phát (do chưa bật GPS).",
          "info",
        );
      }

      itineraryMarkers.forEach((m) => m.remove());
      itineraryMarkers = [];

      result.recommendedLocations.forEach((p, index) => {
        const el = document.createElement("div");
        el.className = "itinerary-marker";
        el.innerText = index + 1;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(p.coordinates)
          .addTo(map);
        el.onclick = () => {
          const targetLoc =
            p.rawFeature ||
            window.allLocations.find((l) => Number(l.id) === Number(p.id));
          if (targetLoc) openLocationSidebar(targetLoc);
        };
        itineraryMarkers.push(marker);
      });

      const vehicleMode =
        document.querySelector('input[name="iti_vehicle"]:checked')?.value ||
        "driving";
      const allRouteCoords = [
        startPoint,
        ...result.recommendedLocations.map((r) => r.coordinates),
      ];
      await drawMultiStopRoute(allRouteCoords, vehicleMode);

      document.getElementById("itinerary-modal")?.classList.remove("active");
      window.Toast?.show(
        `Đã vẽ lộ trình gồm ${result.recommendedLocations.length} điểm dừng!`,
        "success",
      );
    } finally {
      btnGen.innerHTML =
        '<i class="fa-solid fa-map-location-dot"></i> Vẽ Lộ Trình Lên Bản Đồ';
      btnGen.disabled = false;
    }
  });

// SỰ KIỆN BẢNG XẾP HẠNG & ĐỊA ĐIỂM ĐÃ LƯU
document
  .getElementById("btn-leaderboard-in")
  ?.addEventListener("click", async () => {
    document.getElementById("leaderboard-modal").classList.add("active");
    const listEl = document.getElementById("leaderboard-list");
    listEl.innerHTML =
      '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    const { data } = await supabaseClient.from("check_ins").select("user_name");
    if (data) {
      const counts = {};
      data.forEach((i) => {
        const name = i.user_name || "Ẩn danh";
        counts[name] = (counts[name] || 0) + 1;
      });
      const sorted = Object.keys(counts)
        .map((name) => ({ name, score: counts[name] }))
        .sort((a, b) => b.score - a.score);
      listEl.innerHTML = sorted
        .map(
          (u, i) =>
            `<li class="lb-item"><div class="lb-rank ${i < 3 ? "lb-rank-" + (i + 1) : ""}">${
              i < 3 ? '<i class="fa-solid fa-medal"></i>' : i + 1
            }</div><div class="lb-info"><p class="lb-name">${escapeHTML(
              u.name,
            )}</p></div><div class="lb-score">${u.score} Điểm</div></li>`,
        )
        .join("");
    }
  });
document
  .getElementById("close-lb-modal")
  ?.addEventListener("click", () =>
    document.getElementById("leaderboard-modal").classList.remove("active"),
  );

document.getElementById("btn-show-bookmarks")?.addEventListener("click", () => {
  document.getElementById("bookmarks-modal").classList.add("active");
  const listEl = document.getElementById("bookmarks-list");
  const bLocs = window.allLocations.filter((l) =>
    userBookmarkedIds.includes(l.id),
  );
  if (bLocs.length === 0) {
    listEl.innerHTML =
      "<div style='text-align:center; padding:15px; color:#64748b;'>Trống.</div>";
    return;
  }
  listEl.innerHTML = "";
  bLocs.forEach((loc) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="bm-info"><h4 class="bm-name">${escapeHTML(
      loc.properties.name,
    )}</h4><p class="bm-category">${escapeHTML(
      loc.properties.category,
    )}</p></div><button class="remove-bm"><i class="fa-solid fa-trash"></i></button>`;
    li.querySelector(".bm-info").onclick = () => {
      document.getElementById("bookmarks-modal").classList.remove("active");
      map.flyTo({ center: loc.geometry.coordinates, zoom: 15.5 });
      openLocationSidebar(loc);
    };
    li.querySelector(".remove-bm").onclick = async (e) => {
      e.stopPropagation();
      li.style.opacity = "0.5";
      const { error } = await supabaseClient
        .from("user_bookmarks")
        .delete()
        .eq("user_id", currentAuthUser.id)
        .eq("location_id", loc.id);
      if (!error) {
        userBookmarkedIds = userBookmarkedIds.filter((id) => id !== loc.id);
        li.remove();
        if (activeLocationId === loc.id) updateBookmarkButtonUI();
      }
    };
    listEl.appendChild(li);
  });
});
document
  .getElementById("close-bm-modal")
  ?.addEventListener("click", () =>
    document.getElementById("bookmarks-modal").classList.remove("active"),
  );

// ==========================================
// 9. THANH CÔNG CỤ PHÍA TRÊN & RESILIENT GEMINI RAG CHATBOT
// ==========================================
document.getElementById("brand-reset-map")?.addEventListener("click", () => {
  if (map) {
    closeSidebar();
    map.flyTo({ center: [105.267768, 10.262644], zoom: 13, speed: 1.2 });
  }
});

document.getElementById("nav-btn-explore")?.addEventListener("click", () => {
  document.getElementById("explore-modal")?.classList.add("active");
});
document
  .getElementById("close-explore-modal")
  ?.addEventListener("click", () => {
    document.getElementById("explore-modal")?.classList.remove("active");
  });

document.getElementById("nav-btn-about")?.addEventListener("click", () => {
  document.getElementById("about-modal")?.classList.add("active");
});
document.getElementById("close-about-modal")?.addEventListener("click", () => {
  document.getElementById("about-modal")?.classList.remove("active");
});

const ThoaiSonChatbot = {
  isInitialized: false,
  isGenerating: false,
  reviewsCache: [],
  communityPricesCache: [],
  conversationHistory: [],

  memory: {
    lastLocation: null,
    lastCategory: null,
    shownLocationIds: [],
  },

  localKnowledge: [
    {
      keywords: [
        "thoai ngoc hau",
        "nguyen van thoai",
        "danh than",
        "den tho",
        "lang thoai",
        "bia thoai son",
      ],
      answer:
        "<strong>Danh thần Thoại Ngọc Hầu (Nguyễn Văn Thoại, 1761–1829)</strong> là vị khai quốc công thần có công lớn khai hoang vùng Tây Nam Bộ, chỉ huy đào <strong>kênh Thoại Hà (1818)</strong> và kênh Vĩnh Tế. Tại chân Núi Sập, <strong>Đền thờ Thoại Ngọc Hầu</strong> lưu giữ tấm <em>Bia Thoại Sơn (1822)</em> – một trong những bia ký cổ quý giá nhất Nam Bộ.",
    },
    {
      keywords: [
        "lich su",
        "kenh thoai ha",
        "nguon goc",
        "ho ong thoai",
        "khai thac da",
        "an giang",
      ],
      answer:
        "<strong>Núi Sập (Thoại Sơn, An Giang)</strong> là vùng đất giàu truyền thống lịch sử gắn liền với công cuộc khai mở kênh Thoại Hà đầu thế kỷ XIX. Sau quá trình khai thác đá trước kia, những hố sâu dưới chân núi tích nước tạo thành lòng <strong>Hồ Ông Thoại</strong> xanh biếc ngày nay, kết hợp cùng hệ thống cầu vồng, tượng Phật và Đền thờ Thoại Ngọc Hầu tạo nên quần thể du lịch sinh thái – tâm linh đặc sắc.",
    },
    {
      keywords: ["le hoi", "ky yen", "van hoa", "thang ba", "am lich"],
      answer:
        "<strong>Lễ hội Kỳ Yên Đình thần Thoại Ngọc Hầu</strong> diễn ra vào các ngày <strong>10, 11 và 12 tháng 3 Âm lịch</strong> hằng năm tại Núi Sập, Thoại Sơn, thu hút đông đảo du khách thập phương đến dâng hương tưởng niệm.",
    },
  ],

  init: async function () {
    if (supabaseClient) {
      const tasks = [];
      if (window.allPriceItemsCache.length === 0) {
        tasks.push(
          supabaseClient
            .from("price_items")
            .select("*")
            .then(({ data }) => {
              window.allPriceItemsCache = data || [];
            }),
        );
      }
      if (this.reviewsCache.length === 0) {
        tasks.push(
          supabaseClient
            .from("reviews")
            .select("location_id, rating, guest_name, comment")
            .then(({ data }) => {
              this.reviewsCache = data || [];
            }),
        );
      }
      if (this.communityPricesCache.length === 0) {
        tasks.push(
          supabaseClient
            .from("community_price_reports")
            .select("*")
            .eq("is_test_data", false)
            .then(({ data }) => {
              this.communityPricesCache = data || [];
            }),
        );
      }
      await Promise.all(tasks);
    }

    this.ensureApiKeyButton();

    if (!this.isInitialized) {
      this.renderWelcomeMessage();
      this.isInitialized = true;
    }
  },

  getApiKey: function () {
    return (
      window.GEMINI_API_KEY ||
      localStorage.getItem("NUISAP_GEMINI_API_KEY") ||
      ""
    ).trim();
  },

  ensureApiKeyButton: function () {
    const clearBtn = document.getElementById("btn-clear-chat");
    if (!clearBtn || document.getElementById("btn-config-ai-key")) return;

    const keyBtn = document.createElement("button");
    keyBtn.id = "btn-config-ai-key";
    keyBtn.type = "button";
    keyBtn.className =
      "btn-clear-chat btn-ai-key" + (this.getApiKey() ? " active" : "");
    keyBtn.title = "Cài đặt Gemini API Key";
    keyBtn.innerHTML = '<i class="fa-solid fa-key"></i>';

    keyBtn.addEventListener("click", () => this.promptForApiKey());
    clearBtn.parentNode.insertBefore(keyBtn, clearBtn);
  },

  promptForApiKey: function () {
    const current = this.getApiKey();
    const input = window.prompt(
      "Nhập Google Gemini API Key của bạn (lấy tại aistudio.google.com).\nHệ thống sẽ tự động xoay vòng model và chống quá tải:",
      current,
    );
    if (input === null) return;
    const cleaned = input.trim();
    const keyBtn = document.getElementById("btn-config-ai-key");

    if (cleaned) {
      localStorage.setItem("NUISAP_GEMINI_API_KEY", cleaned);
      keyBtn?.classList.add("active");
      window.Toast?.show("Đã lưu Gemini API Key!", "success");
    } else {
      localStorage.removeItem("NUISAP_GEMINI_API_KEY");
      keyBtn?.classList.remove("active");
      window.Toast?.show("Đã chuyển sang chế độ NLP Nội bộ.", "info");
    }
  },

  renderWelcomeMessage: function () {
    const container = document.getElementById("chatbot-messages");
    if (!container) return;
    container.innerHTML = "";
    this.conversationHistory = [];
    this.memory = {
      lastLocation: null,
      lastCategory: null,
      shownLocationIds: [],
    };

    const totalLocs = (window.allLocations || []).length;
    const totalPrices = (window.allPriceItemsCache || []).length;
    const hasKey = Boolean(this.getApiKey() || window.USE_SUPABASE_EDGE_GEMINI);

    const statusBadge = hasKey
      ? `<span style="color:#059669; font-weight:600;"><i class="fa-solid fa-bolt"></i> Gemini AI RAG + Tự động chống quá tải</span>`
      : `<span style="color:#0052cc; font-weight:600;"><i class="fa-solid fa-microchip"></i> Smart NLP Nội bộ (Bấm <i class="fa-solid fa-key"></i> nếu muốn gắn thêm khóa Gemini)</span>`;

    this.appendBotMessage(
      `Xin chào! Tôi là <strong>Trợ lý Du lịch Thoại Sơn – Núi Sập</strong>. 🤖<br/>
      📊 Dữ liệu trực tuyến: <strong>${totalLocs} địa điểm</strong> và <strong>${totalPrices} mức giá niêm yết</strong>.<br/>
      ⚙️ Chế độ: ${statusBadge}<br/><br/>
      Bạn có thể hỏi tự nhiên về các địa điểm tham quan, so sánh giá món ăn/lưu trú, tìm quán gần nhất hoặc hỏi lịch sử vùng đất Thoại Sơn!`,
    );
  },

  buildCompactSystemInstruction: function () {
    const locs = window.allLocations || [];
    const prices = window.allPriceItemsCache || [];
    const fmt = (v) =>
      window.Phase2Engine ? window.Phase2Engine.formatCurrency(v) : v;
    const refPoint = userLocation || [105.267768, 10.262644];

    const compactList = locs
      .map((l) => {
        const distKm = getDistanceFromLatLonInKm(
          refPoint[1],
          refPoint[0],
          l.geometry.coordinates[1],
          l.geometry.coordinates[0],
        ).toFixed(1);

        const locPrices = prices
          .filter((p) => Number(p.location_id) === Number(l.id))
          .slice(0, 5)
          .map(
            (p) =>
              `${p.item_name}:${fmt(p.price_min)}${
                p.price_max > p.price_min ? "-" + fmt(p.price_max) : ""
              }đ/${p.unit}`,
          )
          .join(", ");

        const shortDesc = (l.properties.description || "").substring(0, 90);
        return `[ID:${l.id}] ${l.properties.name} (${l.properties.category}, cách ${distKm}km) | Mô tả: ${shortDesc} | Giá: ${locPrices || "Chưa niêm yết"}`;
      })
      .join("\n");

    return `Bạn là Trợ lý Du lịch xã Thoại Sơn - Núi Sập (tỉnh An Giang).
Quy tắc bắt buộc:
1. Chỉ trả lời dựa trên DỮ LIỆU ĐỊA ĐIỂM dưới đây và lịch sử Thoại Ngọc Hầu (Nguyễn Văn Thoại) / Kênh Thoại Hà (1818) / Bia Thoại Sơn (1822) / Hồ Ông Thoại / Lễ hội Kỳ Yên. Không tự bịa địa điểm hay giá tiền.
2. Trả lời đầy đủ câu, trọn vẹn ý, thân thiện bằng tiếng Việt.
3. Khi nhắc tới địa điểm nào trong danh sách, bắt buộc gắn mã [LOC_ID:số_id] ở cuối câu trả lời (tối đa 3 mã) để hiện thẻ bản đồ.

DỮ LIỆU ĐỊA ĐIỂM & GIÁ NIÊM YẾT:
${compactList}`;
  },

  // HÀM GỌI GEMINI ĐÃ FIX LỖI CẮT CỤT CÂU (maxOutputTokens: 2048 + Nối toàn bộ parts)
  // HÀM GỌI AI HỖ TRỢ ĐỒNG THỜI GEMMA 3, GEMMA 2 VÀ GEMINI
  callGeminiWithResilience: async function (userText) {
    const systemInstructionText = this.buildCompactSystemInstruction();
    const rawHistory = this.conversationHistory.slice(-6);

    // 1. Nếu bật Supabase Edge Function
    if (window.USE_SUPABASE_EDGE_GEMINI && supabaseClient) {
      try {
        const { data, error } = await supabaseClient.functions.invoke(
          "gemini-chat",
          {
            body: {
              systemInstruction: systemInstructionText,
              contents: [
                ...rawHistory,
                { role: "user", parts: [{ text: userText }] },
              ],
            },
          },
        );
        if (!error && data?.replyText) {
          this.conversationHistory.push({
            role: "user",
            parts: [{ text: userText }],
          });
          this.conversationHistory.push({
            role: "model",
            parts: [{ text: data.replyText }],
          });
          return data.replyText;
        }
      } catch (edgeErr) {
        console.warn(
          "Edge Function không phản hồi, chuyển sang gọi trực tiếp:",
          edgeErr,
        );
      }
    }

    // 2. Gọi trực tiếp REST API với cơ chế tự động điều chỉnh Payload cho Gemma 2 / Gemma 3
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const modelsToTry = window.GEMINI_FALLBACK_MODELS || [
      "gemma-3-27b-it",
      "gemma-3-12b-it",
      "gemma-2-27b-it",
      "gemma-2-9b-it",
      "gemini-3.8-flash",
    ];

    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const modelName = modelsToTry[mIdx];
      const isGemmaModel = modelName.toLowerCase().startsWith("gemma");
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName,
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      // CHUẨN HÓA PAYLOAD:
      // - Với Gemma 2 / Gemma 3: Gộp System Instruction vào thẳng tin nhắn user để tránh lỗi 400 Developer Instruction is not enabled
      // - Với Gemini: Dùng trường system_instruction tách biệt như bình thường
      let requestBody;
      if (isGemmaModel) {
        const gemmaContents = [
          ...rawHistory,
          {
            role: "user",
            parts: [
              {
                text: `[HƯỚNG DẪN HỆ THỐNG BẮT BUỘC]\n${systemInstructionText}\n\n[CÂU HỎI CỦA DU KHÁCH]: ${userText}`,
              },
            ],
          },
        ];
        requestBody = {
          contents: gemmaContents,
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 2048,
          },
        };
      } else {
        requestBody = {
          system_instruction: { parts: [{ text: systemInstructionText }] },
          contents: [
            ...rawHistory,
            { role: "user", parts: [{ text: userText }] },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        };
      }

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });

          const resData = await response.json();

          if (response.ok) {
            const parts = resData?.candidates?.[0]?.content?.parts || [];
            const replyText = parts
              .filter((p) => !p.thought && typeof p.text === "string")
              .map((p) => p.text)
              .join("");

            if (replyText) {
              console.log(`✅ Phản hồi thành công từ model: ${modelName}`);
              this.conversationHistory.push({
                role: "user",
                parts: [{ text: userText }],
              });
              this.conversationHistory.push({
                role: "model",
                parts: [{ text: replyText }],
              });
              return replyText;
            }
          }

          const errMsg = (resData?.error?.message || "").toLowerCase();
          const isOverloaded =
            response.status === 503 ||
            response.status === 429 ||
            errMsg.includes("high demand") ||
            errMsg.includes("overloaded") ||
            errMsg.includes("resource exhausted");

          if (isOverloaded && attempt === 1) {
            await new Promise((r) => setTimeout(r, 900));
            continue;
          } else {
            console.warn(
              `Model ${modelName} không khả dụng (${resData?.error?.message}), chuyển model tiếp theo...`,
            );
            break;
          }
        } catch (netErr) {
          break;
        }
      }
    }

    return null;
  },

  // BỘ NÃO DỰ PHÒNG NỘI BỘ (ĐẢM BẢO TRẢ LỜI CHÍNH XÁC 100% KHI GOOGLE QUÁ TẢI)
  runLocalSmartNLP: function (rawQuery) {
    const q = removeVietnameseTones(rawQuery);
    const locs = window.allLocations || [];
    const prices = window.allPriceItemsCache || [];
    const fmt = (v) =>
      window.Phase2Engine ? window.Phase2Engine.formatCurrency(v) : v;
    const locMap = {};
    locs.forEach((l) => (locMap[l.id] = l));

    // 1. Xử lý đại từ ngữ cảnh ("ở đó", "chỗ đó", "chi tiết hơn", "còn chỗ nào khác")
    if (
      (/\b(o do|cho do|noi do|quan do|diem do|cho nay|chi tiet)\b/.test(q) ||
        q === "?") &&
      this.memory.lastLocation
    ) {
      const target = this.memory.lastLocation;
      const locPrices = prices.filter(
        (p) => Number(p.location_id) === Number(target.id),
      );
      const priceText =
        locPrices.length > 0
          ? locPrices
              .map(
                (p) =>
                  `${escapeHTML(p.item_name)}: <strong>${fmt(p.price_min)}đ/${escapeHTML(p.unit)}</strong>`,
              )
              .join(" • ")
          : "Chưa cập nhật bảng giá niêm yết.";

      return {
        html: `Thông tin chi tiết về <strong>${escapeHTML(target.properties.name)}</strong>:<br/>
        📝 ${escapeHTML(target.properties.description || "Đang cập nhật mô tả.")}<br/>
        🏷️ <strong>Giá niêm yết:</strong> ${priceText}`,
        cards: [this.buildCardObject(target)],
      };
    }

    if (q.includes("khac") || q.includes("them")) {
      const pool = this.memory.lastCategory
        ? locs.filter((l) => l.properties.category === this.memory.lastCategory)
        : locs;
      const unseen = pool.filter(
        (l) => !this.memory.shownLocationIds.includes(l.id),
      );
      const pick = (unseen.length > 0 ? unseen : locs).slice(0, 3);
      return {
        html: `Dưới đây là các địa điểm gợi ý tiếp theo tại Thoại Sơn dành cho bạn:`,
        cards: pick.map((l) => this.buildCardObject(l)),
      };
    }

    // 2. Câu hỏi theo túi tiền / ngân sách (VD: "50k", "100 nghìn", "200000")
    const kMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan)\b/);
    const rawNum = q.match(/\b(\d{4,7})\b/);
    const budget = kMatch
      ? parseFloat(kMatch[1]) * 1000
      : rawNum
        ? parseFloat(rawNum[1])
        : null;

    if (budget && budget > 0) {
      const fitPrices = prices.filter((p) => Number(p.price_min) <= budget);
      if (fitPrices.length > 0) {
        const itemsHtml = fitPrices
          .slice(0, 5)
          .map(
            (p) =>
              `<li><strong>${escapeHTML(p.item_name)}</strong> (${escapeHTML(
                locMap[p.location_id]?.properties?.name || "",
              )}): <strong style="color:#059669;">${fmt(p.price_min)}đ/${escapeHTML(
                p.unit,
              )}</strong></li>`,
          )
          .join("");
        const firstLoc = locMap[fitPrices[0].location_id];
        return {
          html: `Với ngân sách khoảng <strong>${fmt(budget)}đ</strong>, bạn có thể tham khảo các dịch vụ/món ăn sau:<ul style="margin:6px 0 0 18px;padding:0;">${itemsHtml}</ul>`,
          cards: firstLoc ? [this.buildCardObject(firstLoc)] : [],
        };
      }
    }

    // 3. Tri thức lịch sử - văn hóa Thoại Sơn & An Giang
    for (const kb of this.localKnowledge) {
      if (kb.keywords.some((kw) => q.includes(kw))) {
        const tourLocs = locs
          .filter((l) => l.properties.category === "Du lịch")
          .slice(0, 2);
        return {
          html: kb.answer,
          cards: tourLocs.map((l) => this.buildCardObject(l)),
        };
      }
    }

    // 4. Tìm địa điểm gần nhất
    if (
      q.includes("gan toi") ||
      q.includes("gan day") ||
      q.includes("gan nhat")
    ) {
      const sorted = locs
        .map((l) => this.buildCardObject(l))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 3);
      return {
        html: `Đây là <strong>3 địa điểm gần vị trí của bạn nhất</strong> tại khu vực Núi Sập – Thoại Sơn:`,
        cards: sorted,
      };
    }

    // 5. Tra cứu giá món ăn / dịch vụ cụ thể
    const matchedPrices = prices.filter((p) => {
      const itemNorm = removeVietnameseTones(p.item_name || "");
      return (
        itemNorm.length > 2 &&
        (q.includes(itemNorm) ||
          itemNorm.split(" ").every((w) => w.length > 1 && q.includes(w)))
      );
    });

    if (matchedPrices.length > 0) {
      const lines = matchedPrices.slice(0, 5).map((p) => {
        const loc = locMap[p.location_id];
        return `<li><strong>${escapeHTML(p.item_name)}</strong> tại <em>${escapeHTML(
          loc?.properties?.name || "",
        )}</em>: <strong style="color:#0052cc;">${fmt(p.price_min)}${
          p.price_max > p.price_min ? " - " + fmt(p.price_max) : ""
        }đ/${escapeHTML(p.unit)}</strong></li>`;
      });
      const firstLoc = locMap[matchedPrices[0].location_id];
      return {
        html: `Thông tin giá niêm yết cho dịch vụ bạn vừa tìm:<ul style="margin:6px 0 0 18px;padding:0;">${lines.join("")}</ul>`,
        cards: firstLoc ? [this.buildCardObject(firstLoc)] : [],
      };
    }

    // 6. Khớp tên hoặc mô tả địa điểm
    const matchedLocs = locs.filter((l) => {
      const n = removeVietnameseTones(l.properties.name || "");
      const d = removeVietnameseTones(l.properties.description || "");
      return (
        (n.length > 2 && (q.includes(n) || n.includes(q))) ||
        (q.length > 4 && d.includes(q))
      );
    });

    if (matchedLocs.length > 0) {
      return {
        html: `Tôi tìm thấy <strong>${matchedLocs.length} địa điểm</strong> phù hợp tại Thoại Sơn:`,
        cards: matchedLocs.slice(0, 3).map((l) => this.buildCardObject(l)),
      };
    }

    // 7. Lọc theo danh mục (Du lịch / Ăn uống / Khách sạn)
    let cat = null;
    if (
      /(an uong|quan an|an gi|dac san|mon an|nha hang|ca phe|bun|com|ga)/.test(
        q,
      )
    )
      cat = "Quán ăn";
    else if (/(khach san|nha nghi|luu tru|cho o|thue phong|qua dem)/.test(q))
      cat = "Khách sạn";
    else if (
      /(du lich|tham quan|choi|canh dep|check in|dia diem|chua|den|ho)/.test(q)
    )
      cat = "Du lịch";

    if (cat) {
      this.memory.lastCategory = cat;
      const catLocs = locs.filter((l) => l.properties.category === cat);
      return {
        html: `Tại Thoại Sơn – Núi Sập hiện có <strong>${catLocs.length} địa điểm</strong> thuộc nhóm <strong>${escapeHTML(
          cat,
        )}</strong>. Dưới đây là các điểm tiêu biểu:`,
        cards: catLocs.slice(0, 3).map((l) => this.buildCardObject(l)),
      };
    }

    // 8. Mặc định: Gợi ý các điểm nổi bật nhất
    return {
      html: `Dưới đây là các địa điểm nổi bật tại <strong>Khu du lịch Núi Sập – Thoại Sơn</strong> mà bạn có thể tham khảo (Bạn có thể hỏi cụ thể tên địa điểm, món ăn hoặc mức giá như <em>"Có 100k ăn gì?"</em>):`,
      cards: locs.slice(0, 3).map((l) => this.buildCardObject(l)),
    };
  },

  buildCardObject: function (loc) {
    const refPoint = userLocation || [105.267768, 10.262644];
    const dist = getDistanceFromLatLonInKm(
      refPoint[1],
      refPoint[0],
      loc.geometry.coordinates[1],
      loc.geometry.coordinates[0],
    );
    const fmt = (v) =>
      window.Phase2Engine ? window.Phase2Engine.formatCurrency(v) : v;
    const items = (window.allPriceItemsCache || []).filter(
      (p) => Number(p.location_id) === Number(loc.id),
    );
    const priceSummary =
      items.length > 0
        ? items
            .slice(0, 2)
            .map(
              (i) =>
                `${escapeHTML(i.item_name)}: ${fmt(i.price_min)}đ/${escapeHTML(i.unit)}`,
            )
            .join(" • ")
        : "Chưa niêm yết giá";

    return {
      rawFeature: loc,
      name: loc.properties.name,
      category: loc.properties.category,
      desc: loc.properties.description,
      distanceKm: dist,
      priceSummaryHtml: priceSummary,
    };
  },

  formatGeminiResponseSafe: function (rawText) {
    const locs = window.allLocations || [];
    const matchedIds = [];

    const textWithoutTags = String(rawText || "").replace(
      /\[LOC_ID:\s*(\d+)\]/gi,
      (_, idStr) => {
        const idNum = Number(idStr);
        if (!matchedIds.includes(idNum)) matchedIds.push(idNum);
        return "";
      },
    );

    let safeHtml = escapeHTML(textWithoutTags.trim())
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^\s*[\*\-]\s+(.+)$/gm, "• $1")
      .replace(/\n/g, "<br/>");

    const cards = matchedIds
      .map((id) => locs.find((l) => Number(l.id) === id))
      .filter(Boolean)
      .slice(0, 3)
      .map((loc) => this.buildCardObject(loc));

    return { html: safeHtml, cards };
  },

  appendUserMessage: function (text) {
    const container = document.getElementById("chatbot-messages");
    if (!container) return;
    const row = document.createElement("div");
    row.className = "chat-row user";
    row.innerHTML = `<div class="chat-bubble">${escapeHTML(text)}</div>`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  },

  showTypingIndicator: function () {
    const container = document.getElementById("chatbot-messages");
    if (!container) return;
    this.removeTypingIndicator();
    const row = document.createElement("div");
    row.className = "chat-row bot";
    row.id = "chatbot-typing-row";
    row.innerHTML = `
      <div class="chat-bot-icon"><i class="fa-solid fa-robot"></i></div>
      <div class="chat-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  },

  removeTypingIndicator: function () {
    document.getElementById("chatbot-typing-row")?.remove();
  },

  appendBotMessage: function (htmlContent, locationCards = []) {
    const container = document.getElementById("chatbot-messages");
    if (!container) return;

    const row = document.createElement("div");
    row.className = "chat-row bot";

    const icon = document.createElement("div");
    icon.className = "chat-bot-icon";
    icon.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.innerHTML = htmlContent;

    if (Array.isArray(locationCards) && locationCards.length > 0) {
      if (locationCards[0].rawFeature) {
        this.memory.lastLocation = locationCards[0].rawFeature;
        this.memory.lastCategory = locationCards[0].category;
      }

      locationCards.forEach((locObj) => {
        if (
          locObj.rawFeature?.id &&
          !this.memory.shownLocationIds.includes(locObj.rawFeature.id)
        ) {
          this.memory.shownLocationIds.push(locObj.rawFeature.id);
        }

        const card = document.createElement("div");
        card.className = "chat-loc-card";

        const distText =
          locObj.distanceKm !== undefined && locObj.distanceKm !== null
            ? ` • Cách ${locObj.distanceKm.toFixed(1)} km`
            : "";

        card.innerHTML = `
          <div class="chat-loc-card-title">
            <span>📍 ${escapeHTML(locObj.name)}</span>
            <span style="font-size:11px; color:#4338ca; background:#e0e7ff; padding:2px 7px; border-radius:10px;">
              ${escapeHTML(locObj.category)}${distText}
            </span>
          </div>
          ${
            locObj.priceSummaryHtml
              ? `<div style="font-size:12px; color:#059669; font-weight:600;">🏷️ ${locObj.priceSummaryHtml}</div>`
              : ""
          }
          <div style="display:flex; gap:6px; margin-top:4px;">
            <button type="button" class="chat-loc-fly-btn btn-view-loc">
              <i class="fa-solid fa-location-arrow"></i> Xem trên bản đồ
            </button>
            <button type="button" class="chat-loc-fly-btn btn-route-loc" style="background:#ecfdf5; color:#059669; border-color:#a7f3d0;">
              <i class="fa-solid fa-route"></i> Chỉ đường
            </button>
          </div>
        `;

        card.querySelector(".btn-view-loc").addEventListener("click", () => {
          document.getElementById("lookup-modal")?.classList.remove("active");
          if (locObj.rawFeature && map) {
            map.flyTo({
              center: locObj.rawFeature.geometry.coordinates,
              zoom: 16,
              speed: 1.2,
            });
            openLocationSidebar(locObj.rawFeature);
          }
        });

        card.querySelector(".btn-route-loc").addEventListener("click", () => {
          document.getElementById("lookup-modal")?.classList.remove("active");
          if (locObj.rawFeature) {
            const start = userLocation || [105.267768, 10.262644];
            drawRoute(start, locObj.rawFeature.geometry.coordinates);
          }
        });

        bubble.appendChild(card);
      });
    }

    row.appendChild(icon);
    row.appendChild(bubble);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  },

  processQuery: async function (rawQuery) {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.showTypingIndicator();

    try {
      const aiReply = await this.callGeminiWithResilience(rawQuery);
      this.removeTypingIndicator();

      if (aiReply) {
        const formatted = this.formatGeminiResponseSafe(aiReply);
        this.appendBotMessage(formatted.html, formatted.cards);
      } else {
        const localReply = this.runLocalSmartNLP(rawQuery);
        this.appendBotMessage(localReply.html, localReply.cards);
      }
    } catch (err) {
      this.removeTypingIndicator();
      const localReply = this.runLocalSmartNLP(rawQuery);
      this.appendBotMessage(localReply.html, localReply.cards);
    } finally {
      this.isGenerating = false;
    }
  },
};

document
  .getElementById("nav-btn-lookup")
  ?.addEventListener("click", async () => {
    document.getElementById("lookup-modal")?.classList.add("active");
    await ThoaiSonChatbot.init();
    setTimeout(() => document.getElementById("chatbot-input")?.focus(), 200);
  });

document.getElementById("close-lookup-modal")?.addEventListener("click", () => {
  document.getElementById("lookup-modal")?.classList.remove("active");
});

document.getElementById("btn-clear-chat")?.addEventListener("click", () => {
  ThoaiSonChatbot.renderWelcomeMessage();
});

document.getElementById("chatbot-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const inputEl = document.getElementById("chatbot-input");
  const text = inputEl?.value.trim();
  if (!text || ThoaiSonChatbot.isGenerating) return;

  ThoaiSonChatbot.appendUserMessage(text);
  inputEl.value = "";
  ThoaiSonChatbot.processQuery(text);
});

document.querySelectorAll(".chat-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const query = chip.getAttribute("data-query");
    if (!query || ThoaiSonChatbot.isGenerating) return;
    ThoaiSonChatbot.appendUserMessage(query);
    ThoaiSonChatbot.processQuery(query);
  });
});

window.onload = initMap;
