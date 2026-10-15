// ==========================================
// BẢN ĐỒ DU LỊCH NÚI SẬP - SCRIPT
// Tương thích 100% Giao diện
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
window.allLocations = [];
let currentFilteredLocations = [];

let userLocation = null;
let userMarker = null;
let currentAuthUser = null;
let userBookmarkedIds = [];
let itineraryMarkers = [];

const supabaseClient = window.supabaseClient;

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
      checkGlobalAuth();
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
        if (hoveredId !== null)
          map.setFeatureState(
            { source: "Nuisaptravel-src", id: hoveredId },
            { hover: false },
          );
        hoveredId = e.features[0].id;
        map.setFeatureState(
          { source: "Nuisaptravel-src", id: hoveredId },
          { hover: true },
        );
      }
    });
    map.on("mouseleave", "unclustered-point", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null)
        map.setFeatureState(
          { source: "Nuisaptravel-src", id: hoveredId },
          { hover: false },
        );
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
    window.allLocations = data.map((item) => {
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
  } catch (e) {
    console.error(e);
  }
}

// ==========================================
// 2. GPS & DẪN ĐƯỜNG OSRM (MIỄN PHÍ)
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
  const osrmProfile = mode === "walking" ? "foot" : "driving";
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&overview=full`;
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
    if (window.Toast) window.Toast.show("Lỗi chỉ đường.", "error");
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
    } else
      currentFilteredLocations = window.allLocations.filter(
        (loc) => loc.properties.category === cat,
      );
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
  resetReviewForm(); // Gọi hàm xóa form khi đóng sidebar
}

function openLocationSidebar(feature) {
  activeLocationId = feature.id || feature.properties.id;
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
  } else distanceTag.style.display = "none";

  // Carousel ẢNH
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
    const img = document.createElement("img");
    img.src = url;
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

  // ACTION BUTTONS (Âm thanh, Dẫn đường, Check-in)
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
    } else
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}`,
        "_blank",
      );
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
  return str
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
      li.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#64748b;"></i> <div><span style="font-weight:600; display:block;">${loc.properties.name}</span><span style="font-size: 11px; color:#64748b;">${loc.properties.category}</span></div>`;
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
// 6. GIÁ, ĐÁNH GIÁ, USER VÀ QUẢN TRỊ
// ==========================================

// --- 6.1. XÁC THỰC NGƯỜI DÙNG & RENDER NAVBAR ĐÁY ---
async function checkGlobalAuth() {
  if (!supabaseClient) return;
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const authSection = document.getElementById("auth-section");

    if (session && authSection) {
      currentAuthUser = session.user;

      // Tự động điền tên cho phần đánh giá
      const nameInput = document.getElementById("reviewer-name");
      if (nameInput) {
        nameInput.value =
          currentAuthUser.user_metadata?.full_name ||
          currentAuthUser.email.split("@")[0];
        nameInput.readOnly = true;
      }

      // Lấy danh sách địa điểm đã lưu
      const { data } = await supabaseClient
        .from("user_bookmarks")
        .select("location_id")
        .eq("user_id", currentAuthUser.id);
      if (data) userBookmarkedIds = data.map((d) => d.location_id);

      // Lấy quyền User (Role)
      const { data: profileData } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", currentAuthUser.id)
        .single();
      const userRole = profileData?.role || "user";

      // Kiến tạo lại toàn bộ thanh điều khiển
      let adminHtml = "";
      if (userRole === "admin" || userRole === "manager") {
        adminHtml = `
          <span class="separator"></span>
          <a href="dashboard.html" id="btn-admin" style="color: #10b981; display: flex; align-items: center; gap: 8px; font-weight: 600; text-decoration: none;">
            <i class="fa-solid fa-chart-pie"></i> Quản trị
          </a>
        `;
      }

      authSection.innerHTML = `
        <a id="btn-open-itinerary" style="color: #0052cc; display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer;">
          <i class="fa-solid fa-map"></i> Lộ trình
        </a>
        <span class="separator"></span>
        <a id="btn-leaderboard-in" style="color: #f59e0b; display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer;">
          <i class="fa-solid fa-trophy"></i> Hạng
        </a>
        <span class="separator"></span>
        <a id="btn-show-bookmarks" style="color: #ef4444; display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer;">
          <i class="fa-solid fa-heart"></i> Đã lưu
        </a>
        ${adminHtml}
        <span class="separator"></span>
        <a href="profile.html" id="btn-profile" style="color: #8b5cf6; display: flex; align-items: center; gap: 8px; font-weight: 600; text-decoration: none;">
          <i class="fa-solid fa-user"></i> Hồ sơ
        </a>
      `;

      // Gắn lại sự kiện cho các nút vừa tạo
      document
        .getElementById("btn-open-itinerary")
        ?.addEventListener("click", () => {
          document.getElementById("itinerary-modal").classList.add("active");
        });

      document
        .getElementById("btn-leaderboard-in")
        ?.addEventListener("click", async () => {
          document.getElementById("leaderboard-modal").classList.add("active");
          const listEl = document.getElementById("leaderboard-list");
          listEl.innerHTML =
            '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
          const { data } = await supabaseClient
            .from("check_ins")
            .select("user_name");
          if (data) {
            const counts = {};
            data.forEach(
              (i) =>
                (counts[i.user_name || "Ẩn danh"] =
                  (counts[i.user_name || "Ẩn danh"] || 0) + 1),
            );
            const sorted = Object.keys(counts)
              .map((name) => ({ name, score: counts[name] }))
              .sort((a, b) => b.score - a.score);
            listEl.innerHTML = sorted
              .map(
                (u, i) =>
                  `<li class="lb-item"><div class="lb-rank ${i < 3 ? "lb-rank-" + (i + 1) : ""}">${i < 3 ? '<i class="fa-solid fa-medal"></i>' : i + 1}</div><div class="lb-info"><p class="lb-name">${u.name}</p></div><div class="lb-score">${u.score} Điểm</div></li>`,
              )
              .join("");
          }
        });

      document
        .getElementById("btn-show-bookmarks")
        ?.addEventListener("click", () => {
          document.getElementById("bookmarks-modal").classList.add("active");
          const listEl = document.getElementById("bookmarks-list");
          const bLocs = window.allLocations.filter((l) =>
            userBookmarkedIds.includes(l.id),
          );
          if (bLocs.length === 0)
            return (listEl.innerHTML =
              "<div style='text-align:center; padding:15px; color:#64748b;'>Trống.</div>");
          listEl.innerHTML = "";
          bLocs.forEach((loc) => {
            const li = document.createElement("li");
            li.innerHTML = `<div class="bm-info"><h4 class="bm-name">${loc.properties.name}</h4><p class="bm-category">${loc.properties.category}</p></div><button class="remove-bm"><i class="fa-solid fa-trash"></i></button>`;
            li.querySelector(".bm-info").onclick = () => {
              document
                .getElementById("bookmarks-modal")
                .classList.remove("active");
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
                userBookmarkedIds = userBookmarkedIds.filter(
                  (id) => id !== loc.id,
                );
                li.remove();
                if (activeLocationId === loc.id) updateBookmarkButtonUI();
              }
            };
            listEl.appendChild(li);
          });
        });
    }
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
  }
}

// --- 6.2. HIỂN THỊ BẢNG GIÁ DỊCH VỤ ---
async function loadLocationPrices(locId) {
  const container = document.getElementById("sb-prices");
  if (!container) return;
  container.innerHTML =
    '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  try {
    const { data, error } = await supabaseClient
      .from("price_items")
      .select("*")
      .eq("location_id", locId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0)
      return (container.innerHTML =
        '<div class="price-container"><div class="price-header"><i class="fa-solid fa-tag"></i> Bảng giá</div><p style="font-size: 13px; color: #64748b;">Chưa có dữ liệu giá từ ban quản lý.</p></div>');

    const wrapper = document.createElement("div");
    wrapper.className = "price-container";
    wrapper.innerHTML =
      '<div class="price-header"><i class="fa-solid fa-tag"></i> Bảng giá tham khảo</div>';

    data.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "price-item";
      const isOld =
        Math.floor((new Date() - new Date(item.updated_at)) / 86400000) > 90;
      const fmt = (v) => new Intl.NumberFormat("vi-VN").format(v);
      const priceText =
        item.price_min === item.price_max
          ? fmt(item.price_min)
          : `${fmt(item.price_min)} - ${fmt(item.price_max)}`;
      itemDiv.innerHTML = `<span class="price-name" style="${isOld ? "text-decoration:line-through;color:#94a3b8;" : ""}">${item.item_name}</span><span class="price-value">${priceText} <span class="price-unit">${item.unit}</span></span>`;
      wrapper.appendChild(itemDiv);
    });
    container.innerHTML = "";
    container.appendChild(wrapper);
  } catch (err) {
    container.innerHTML = "";
  }
}

// --- 6.3. TẢI VÀ HIỂN THỊ ĐÁNH GIÁ (CÓ LƯỚI ẢNH) ---
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
    countEl.textContent = data.length;
    if (data.length === 0)
      return (listEl.innerHTML =
        "<p style='color:#64748b; font-size:14px;'>Chưa có đánh giá.</p>");

    listEl.innerHTML = data
      .map((r) => {
        let imagesHtml = "";
        if (r.image_url) {
          try {
            const urls = JSON.parse(r.image_url);
            if (Array.isArray(urls)) {
              imagesHtml =
                `<div class="review-images-grid">` +
                urls
                  .map(
                    (u) =>
                      `<img src="${u}" class="review-image-display" style="margin-top:0; cursor:pointer;" onclick="window.open('${u}', '_blank')"/>`,
                  )
                  .join("") +
                `</div>`;
            } else {
              imagesHtml = `<img src="${r.image_url}" class="review-image-display" style="cursor:pointer;" onclick="window.open('${r.image_url}', '_blank')"/>`;
            }
          } catch (e) {
            imagesHtml = `<img src="${r.image_url}" class="review-image-display" style="cursor:pointer;" onclick="window.open('${r.image_url}', '_blank')"/>`;
          }
        }

        return `<div class="review-item">
        <div class="review-header">
          <span class="reviewer-name">${r.guest_name.replace(/</g, "&lt;")}</span>
          <span class="review-stars">${"⭐".repeat(r.rating)}</span>
        </div>
        <p class="review-comment">${r.comment}</p>
        ${imagesHtml}
      </div>`;
      })
      .join("");
  } catch (e) {
    listEl.innerHTML = "Lỗi tải đánh giá.";
  }
}

// --- 6.4. LOGIC ĐĂNG ĐÁNH GIÁ (HỖ TRỢ NHIỀU ẢNH) ---
let selectedReviewFiles = []; // Mảng chứa ảnh tạm

// Reset nội dung form đánh giá
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

// Render ảnh preview để xóa bớt nếu cần
function renderReviewImagePreviews() {
  const container = document.getElementById("review-image-preview-container");
  if (!container) return;
  container.innerHTML = "";

  selectedReviewFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrap = document.createElement("div");
      wrap.className = "review-img-wrap";
      wrap.innerHTML = `
              <img src="${e.target.result}" />
              <button type="button" class="remove-review-img-btn" data-index="${index}">
                  <i class="fa-solid fa-xmark"></i>
              </button>
          `;
      container.appendChild(wrap);

      wrap.querySelector(".remove-review-img-btn").onclick = function () {
        const idx = parseInt(this.getAttribute("data-index"));
        selectedReviewFiles.splice(idx, 1);
        renderReviewImagePreviews();

        const fileNameSpan = document.getElementById("review-file-name");
        if (selectedReviewFiles.length > 0) {
          fileNameSpan.textContent = `Đã chọn ${selectedReviewFiles.length} ảnh`;
        } else {
          fileNameSpan.textContent = "Đính kèm ảnh (Tùy chọn)";
        }
      };
    };
    reader.readAsDataURL(file);
  });
}

// Bắt sự kiện chọn ảnh
const reviewImgInput = document.getElementById("review-image");
reviewImgInput?.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  selectedReviewFiles = selectedReviewFiles.concat(files);

  const fileNameSpan = document.getElementById("review-file-name");
  if (selectedReviewFiles.length > 0) {
    fileNameSpan.textContent = `Đã chọn ${selectedReviewFiles.length} ảnh`;
  } else {
    fileNameSpan.textContent = "Đính kèm ảnh (Tùy chọn)";
  }

  renderReviewImagePreviews();
  e.target.value = ""; // Đặt lại để cho phép chọn lại ảnh cùng tên
});

// Gửi Đánh Giá lên Supabase
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
        rating: document.getElementById("review-rating").value,
        comment: comment,
        user_id: currentAuthUser?.id,
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
// 7. LỊCH TRÌNH (TSP), LEADERBOARD, BOOKMARK
// ==========================================
document
  .getElementById("btn-open-itinerary")
  ?.addEventListener("click", () =>
    document.getElementById("itinerary-modal").classList.add("active"),
  );
document
  .getElementById("close-itinerary-modal")
  ?.addEventListener("click", () =>
    document.getElementById("itinerary-modal").classList.remove("active"),
  );
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
      data.forEach(
        (i) =>
          (counts[i.user_name || "Ẩn danh"] =
            (counts[i.user_name || "Ẩn danh"] || 0) + 1),
      );
      const sorted = Object.keys(counts)
        .map((name) => ({ name, score: counts[name] }))
        .sort((a, b) => b.score - a.score);
      listEl.innerHTML = sorted
        .map(
          (u, i) =>
            `<li class="lb-item"><div class="lb-rank ${i < 3 ? "lb-rank-" + (i + 1) : ""}">${i < 3 ? '<i class="fa-solid fa-medal"></i>' : i + 1}</div><div class="lb-info"><p class="lb-name">${u.name}</p></div><div class="lb-score">${u.score} Điểm</div></li>`,
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
  if (bLocs.length === 0)
    return (listEl.innerHTML =
      "<div style='text-align:center; padding:15px; color:#64748b;'>Trống.</div>");
  listEl.innerHTML = "";
  bLocs.forEach((loc) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="bm-info"><h4 class="bm-name">${loc.properties.name}</h4><p class="bm-category">${loc.properties.category}</p></div><button class="remove-bm"><i class="fa-solid fa-trash"></i></button>`;
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

document
  .getElementById("btn-generate-route")
  ?.addEventListener("click", async () => {
    if (!userLocation)
      return window.Toast?.show("Bật GPS để tạo lịch trình!", "error");
    const prefs = Array.from(
      document.querySelectorAll(".iti-pref:checked"),
    ).map((cb) => cb.value);
    const candidates = window.allLocations.filter((loc) =>
      prefs.includes(loc.properties.category),
    );
    if (candidates.length === 0)
      return window.Toast?.show(
        "Vui lòng chọn ít nhất 1 sở thích có dữ liệu.",
        "info",
      );

    const btnGen = document.getElementById("btn-generate-route");
    btnGen.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnGen.disabled = true;

    let maxStops =
      document.querySelector('input[name="iti_time"]:checked').value === "2"
        ? 2
        : 4;
    if (
      document.querySelector('input[name="iti_companion"]:checked').value ===
      "family"
    )
      maxStops -= 1;

    let routePoints = [],
      currentLoc = userLocation,
      unvisited = [...candidates];
    for (let i = 0; i < maxStops; i++) {
      if (unvisited.length === 0) break;
      let nearestIdx = -1,
        minDist = Infinity;
      unvisited.forEach((loc, idx) => {
        let dist = getDistanceFromLatLonInKm(
          currentLoc[1],
          currentLoc[0],
          loc.geometry.coordinates[1],
          loc.geometry.coordinates[0],
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      });
      if (nearestIdx !== -1) {
        routePoints.push(unvisited[nearestIdx]);
        currentLoc = unvisited[nearestIdx].geometry.coordinates;
        unvisited.splice(nearestIdx, 1);
      }
    }

    itineraryMarkers.forEach((m) => m.remove());
    itineraryMarkers = [];
    routePoints.forEach((p, index) => {
      const el = document.createElement("div");
      el.className = "itinerary-marker";
      el.innerText = index + 1;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(p.geometry.coordinates)
        .addTo(map);
      el.onclick = () => openLocationSidebar(p);
      itineraryMarkers.push(marker);
    });

    const v = document.querySelector('input[name="iti_vehicle"]:checked').value;
    await drawRoute(
      userLocation,
      routePoints[routePoints.length - 1].geometry.coordinates,
      v,
    );

    btnGen.innerHTML = "Tính toán lộ trình";
    btnGen.disabled = false;
    document.getElementById("itinerary-modal").classList.remove("active");
  });

window.onload = initMap;
