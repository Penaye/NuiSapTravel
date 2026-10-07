// ==========================================
// ĐĂNG KÝ SERVICE WORKER (PWA) - TẠM TẮT KHI DEV
// ==========================================
/* 
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => console.log('Service Worker đăng ký thành công:', reg.scope))
      .catch((err) => console.log('Lỗi đăng ký Service Worker:', err));
  });
}
*/

// ==========================================
// CẤU HÌNH AUDIO TRỢ LÝ ẢO (TEXT-TO-SPEECH)
// ==========================================
const synth = window.speechSynthesis;
let currentUtterance = null;

function updateAudioBtnUI(isPlaying) {
  const btn = document.getElementById("btn-audio");
  if (!btn) return;
  if (isPlaying) {
    btn.innerHTML = `<i class="fa-solid fa-circle-pause"></i> Dừng`;
    btn.classList.add("playing");
  } else {
    btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> Nghe`;
    btn.classList.remove("playing");
  }
}

// ==========================================
// THUẬT TOÁN HAVERSINE (TÍNH KHOẢNG CÁCH)
// ==========================================
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Bán kính trái đất (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ==========================================
// 1. KHỞI TẠO BẢN ĐỒ MAPBOX
// ==========================================
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
let currentMapStyle = "streets-v12";
let activeLocationId = null;
window.allLocations = [];
let currentFilteredLocations = [];

let userLocation = null;
let userMarker = null;
let currentAuthUser = null;
let userBookmarkedIds = [];

try {
  mapboxgl.accessToken =
    "pk.eyJ1IjoidGFuZGF0MjAwOSIsImEiOiJjbXVtYWF1NGowMGNmMnlvbW9ndjJzNGkwIn0.wNCub38RhKYzfaod_-21VA";
  map = new mapboxgl.Map({
    container: "map",
    style: `mapbox://styles/mapbox/${currentMapStyle}`,
    projection: "globe",
    zoom: 13,
    center: [105.267768, 10.262644],
    maxBounds: [
      [Math.min(...lngs) - 0.2, Math.min(...lats) - 0.2],
      [Math.max(...lngs) + 0.2, Math.max(...lats) + 0.2],
    ],
  });
  map.addControl(new mapboxgl.NavigationControl());
  initGeolocation();
} catch (err) {
  console.error("Lỗi khởi tạo Mapbox:", err);
}

const supabaseClient = window.supabaseClient;

// ==========================================
// 2. ĐỊNH VỊ VÀ CHỈ ĐƯỜNG
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
          userMarker = new mapboxgl.Marker(el)
            .setLngLat(userLocation)
            .setPopup(
              new mapboxgl.Popup({ offset: 15 }).setText("Vị trí của bạn"),
            )
            .addTo(map);
        } else if (userMarker) {
          userMarker.setLngLat(userLocation);
        }
      },
      (err) => {
        console.log("Chưa thể lấy vị trí GPS chính xác:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  }
}

async function drawRoute(startCoords, endCoords) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0].geometry;
      if (map.getSource("route-src")) map.getSource("route-src").setData(route);
      const bounds = route.coordinates.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(route.coordinates[0], route.coordinates[0]),
      );
      map.fitBounds(bounds, { padding: 60 });
    }
  } catch (err) {
    if (window.Toast) window.Toast.show("Lỗi chỉ đường.", "error");
  }
}

// ==========================================
// 3. SIDEBAR / BOTTOM SHEET LOGIC
// ==========================================
const sidebar = document.getElementById("info-sidebar");

let touchStartY = 0;
sidebar.addEventListener(
  "touchstart",
  (e) => {
    touchStartY = e.changedTouches[0].screenY;
  },
  { passive: true },
);

sidebar.addEventListener(
  "touchend",
  (e) => {
    const touchEndY = e.changedTouches[0].screenY;
    if (touchEndY - touchStartY > 100) {
      sidebar.classList.remove("open");
      if (synth.speaking) synth.cancel(); // Ngắt audio khi đóng
      updateAudioBtnUI(false);
    }
  },
  { passive: true },
);

if (document.getElementById("close-sidebar")) {
  document.getElementById("close-sidebar").addEventListener("click", () => {
    sidebar.classList.remove("open");
    if (synth.speaking) synth.cancel(); // Ngắt audio khi đóng
    updateAudioBtnUI(false);
  });
}

function openLocationSidebar(feature) {
  activeLocationId = feature.id || feature.properties.id;
  loadLocationReviews(activeLocationId);

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

  let images = [];
  try {
    images =
      typeof feature.properties.imageUrls === "string"
        ? JSON.parse(feature.properties.imageUrls)
        : feature.properties.imageUrls;
  } catch (e) {
    images = ["https://placehold.co/600x400/ccc/white?text=No+Image"];
  }

  const carouselContainer = document.getElementById("sb-carousel");
  const prevBtn = document.getElementById("sb-carousel-prev");
  const nextBtn = document.getElementById("sb-carousel-next");
  const indicatorsContainer = document.getElementById("sb-carousel-indicators");

  carouselContainer.innerHTML = "";
  indicatorsContainer.innerHTML = "";

  images.forEach((url, index) => {
    const img = document.createElement("img");
    img.src = url;
    carouselContainer.appendChild(img);

    const ind = document.createElement("div");
    ind.className = `indicator ${index === 0 ? "active" : ""}`;
    indicatorsContainer.appendChild(ind);
  });

  let currentSlide = 0;
  const totalSlides = images.length;

  if (totalSlides <= 1) {
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    indicatorsContainer.style.display = "none";
  } else {
    prevBtn.style.display = "flex";
    nextBtn.style.display = "flex";
    indicatorsContainer.style.display = "flex";
  }

  function updateSlider() {
    carouselContainer.style.transform = `translateX(-${currentSlide * 100}%)`;
    Array.from(indicatorsContainer.children).forEach((dot, idx) => {
      dot.classList.toggle("active", idx === currentSlide);
    });
  }

  prevBtn.onclick = () => {
    currentSlide = currentSlide > 0 ? currentSlide - 1 : totalSlides - 1;
    updateSlider();
  };

  nextBtn.onclick = () => {
    currentSlide = currentSlide < totalSlides - 1 ? currentSlide + 1 : 0;
    updateSlider();
  };

  Array.from(indicatorsContainer.children).forEach((dot, idx) => {
    dot.onclick = () => {
      currentSlide = idx;
      updateSlider();
    };
  });

  updateBookmarkButtonUI();

  const btnDir = document.getElementById("btn-directions");
  if (btnDir) {
    btnDir.onclick = () => {
      if (userLocation) {
        drawRoute(userLocation, feature.geometry.coordinates);
        if (window.innerWidth <= 768) sidebar.classList.remove("open");
      } else {
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}`,
          "_blank",
        );
      }
    };
  }

  // --- AUDIO GUIDE LOGIC ---
  if (synth.speaking) synth.cancel();
  updateAudioBtnUI(false);

  const btnAudio = document.getElementById("btn-audio");
  if (btnAudio) {
    btnAudio.onclick = () => {
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
        currentUtterance.rate = 1.0;

        currentUtterance.onend = () => updateAudioBtnUI(false);
        currentUtterance.onerror = () => updateAudioBtnUI(false);

        synth.speak(currentUtterance);
        updateAudioBtnUI(true);
      }
    };
  }

  // --- GAMIFICATION CHECK-IN LOGIC ---
  const btnCheckin = document.getElementById("btn-checkin");
  if (btnCheckin) {
    btnCheckin.onclick = async () => {
      if (!currentAuthUser) {
        if (window.Toast)
          window.Toast.show("Cần đăng nhập để Check-in nhận huy hiệu!", "info");
        return;
      }
      if (!userLocation) {
        if (window.Toast)
          window.Toast.show("Đang dò tọa độ GPS của bạn...", "info");
        return;
      }

      const dist = getDistanceFromLatLonInKm(
        userLocation[1],
        userLocation[0],
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
      );

      if (dist <= 0.05) {
        // Bán kính 50m
        btnCheckin.disabled = true;
        btnCheckin.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...`;

        // Kiểm tra xem user đã check-in điểm này chưa
        const { data: existing } = await supabaseClient
          .from("check_ins")
          .select("id")
          .eq("user_id", currentAuthUser.id)
          .eq("location_id", activeLocationId);

        if (existing && existing.length > 0) {
          if (window.Toast)
            window.Toast.show(
              "Bạn đã Check-in địa điểm này trước đây rồi!",
              "info",
            );
        } else {
          // Lưu Check-in mới
          const userName =
            currentAuthUser.user_metadata?.full_name ||
            currentAuthUser.email.split("@")[0];
          const { error } = await supabaseClient.from("check_ins").insert([
            {
              user_id: currentAuthUser.id,
              location_id: activeLocationId,
              user_name: userName,
            },
          ]);

          if (error) {
            if (window.Toast)
              window.Toast.show("Lỗi hệ thống: " + error.message, "error");
          } else {
            if (window.Toast)
              window.Toast.show(
                "🎉 Check-in thành công! Bạn nhận được 1 Huy hiệu mới.",
                "success",
              );
          }
        }
        btnCheckin.disabled = false;
        btnCheckin.innerHTML = `<i class="fa-solid fa-map-pin"></i> Check-in`;
      } else {
        if (window.Toast)
          window.Toast.show(
            `Bạn cách vị trí này ${(dist * 1000).toFixed(0)}m. Hãy đến gần hơn (<50m) để Check-in!`,
            "error",
          );
      }
    };
  }

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

document.getElementById("btn-bookmark").addEventListener("click", async () => {
  if (!currentAuthUser) {
    if (window.Toast) return window.Toast.show("Cần đăng nhập!", "info");
  }
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

function renderBookmarksModal() {
  const listEl = document.getElementById("bookmarks-list");
  listEl.innerHTML = "";
  const bLocs = window.allLocations.filter((loc) =>
    userBookmarkedIds.includes(loc.id),
  );
  if (bLocs.length === 0)
    return (listEl.innerHTML = "<p style='text-align:center;'>Trống.</p>");
  bLocs.forEach((loc) => {
    const li = document.createElement("li");
    li.className = "bm-item";

    let thumbUrl = "https://placehold.co/600x400/ccc/white?text=No+Image";
    try {
      const imgs =
        typeof loc.properties.imageUrls === "string"
          ? JSON.parse(loc.properties.imageUrls)
          : loc.properties.imageUrls;
      if (imgs && imgs.length > 0) thumbUrl = imgs[0];
    } catch (e) {}

    li.innerHTML = `<img src="${thumbUrl}"><div class="bm-item-info"><h4>${loc.properties.name}</h4><p>${loc.properties.category}</p></div>`;
    li.addEventListener("click", () => {
      document.getElementById("bookmarks-modal").classList.remove("active");
      map.flyTo({ center: loc.geometry.coordinates, zoom: 15.5 });
      openLocationSidebar(loc);
    });
    listEl.appendChild(li);
  });
}
document
  .getElementById("close-bm-modal")
  ?.addEventListener("click", () =>
    document.getElementById("bookmarks-modal").classList.remove("active"),
  );

// ==========================================
// 4. TẢI DỮ LIỆU TỪ SUPABASE
// ==========================================
function processLocationsData(data) {
  window.allLocations = data.map((item) => {
    let arrUrls = [];
    if (item.image_urls && item.image_urls.length > 0) {
      arrUrls = item.image_urls;
    } else if (item.image_url) {
      arrUrls = [item.image_url];
    } else {
      arrUrls = ["https://placehold.co/600x400/ccc/white?text=No+Image"];
    }

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
  updateMapSourceData();
}

async function fetchAndRenderData() {
  if (!supabaseClient || !map) return;
  const loader = document.getElementById("global-loader");
  if (loader) loader.style.display = "flex";

  try {
    const { data, error } = await supabaseClient
      .from("locations")
      .select("*, categories!locations_category_id_fkey(name)")
      .eq("status", "active");

    if (error) throw error;

    localStorage.setItem("nuisap_locations_cache", JSON.stringify(data));
    processLocationsData(data);
  } catch (e) {
    console.warn("Lỗi mạng hoặc Supabase, thử tải từ LocalStorage:", e);
    const cachedData = localStorage.getItem("nuisap_locations_cache");
    if (cachedData) {
      processLocationsData(JSON.parse(cachedData));
    } else {
      if (window.Toast)
        window.Toast.show(
          "Không có kết nối mạng và không có dữ liệu ngoại tuyến để hiển thị.",
          "error",
        );
    }
  } finally {
    if (loader) {
      loader.style.opacity = "0";
      setTimeout(() => (loader.style.display = "none"), 300);
    }
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

// ==========================================
// 5. LỚP BẢN ĐỒ & TƯƠNG TÁC CHUỘT
// ==========================================
function addMapLayers() {
  map.getStyle().layers.forEach((layer) => {
    if (layer.id.includes("poi-label") || layer.id.includes("transit-label"))
      map.setLayoutProperty(layer.id, "visibility", "none");
  });

  if (currentMapStyle === "satellite-streets-v12") {
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
    }
    map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
  } else {
    map.setTerrain(null);
  }

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
      "line-color": "#ff0000",
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

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "Nuisaptravel-src",
    minzoom: 11.5,
    paint: {
      "circle-color": [
        "match",
        ["get", "category"],
        "Du lịch",
        "#2E8B57",
        "Quán ăn",
        "#FF8C00",
        "Khách sạn",
        "#800080",
        "#0052cc",
      ],
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        12,
        8,
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        2,
        1.5,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 12, 1],
      "circle-stroke-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11.5,
        0,
        12,
        1,
      ],
    },
  });

  map.addLayer({
    id: "unclustered-icon",
    type: "symbol",
    source: "Nuisaptravel-src",
    minzoom: 11.5,
    layout: {
      "icon-image": "star-15",
      "icon-size": 0.55,
      "text-field": ["get", "name"],
      "text-offset": [0, 1],
      "text-anchor": "top",
      "text-size": 13,
    },
    paint: {
      "icon-color": "#ffffff",
      "text-color": [
        "match",
        ["get", "category"],
        "Du lịch",
        "#1C5435",
        "Quán ăn",
        "#B86500",
        "Khách sạn",
        "#4B0082",
        "#000000",
      ],
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
      "icon-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 12, 1],
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 12, 1],
    },
  });
}

if (map) {
  map.on("style.load", () => {
    map.setFog({
      color: "rgb(186, 210, 235)",
      "high-color": "rgb(36, 92, 223)",
      "horizon-blend": 0.02,
      "space-color": "rgb(11, 11, 25)",
      "star-intensity": 0.6,
    });
    addMapLayers();
    if (window.allLocations.length === 0) fetchAndRenderData();
  });

  let hoveredUnclusteredId = null;

  map.on("click", "unclustered-point", (e) => {
    if (!e.features.length) return;
    openLocationSidebar(e.features[0]);
    map.flyTo({ center: e.features[0].geometry.coordinates, zoom: 15.5 });
  });

  map.on("mousemove", "unclustered-point", (e) => {
    map.getCanvas().style.cursor = "pointer";
    if (e.features.length > 0) {
      if (hoveredUnclusteredId !== null) {
        map.setFeatureState(
          { source: "Nuisaptravel-src", id: hoveredUnclusteredId },
          { hover: false },
        );
      }
      hoveredUnclusteredId = e.features[0].id;
      map.setFeatureState(
        { source: "Nuisaptravel-src", id: hoveredUnclusteredId },
        { hover: true },
      );
    }
  });

  map.on("mouseleave", "unclustered-point", () => {
    map.getCanvas().style.cursor = "";
    if (hoveredUnclusteredId !== null) {
      map.setFeatureState(
        { source: "Nuisaptravel-src", id: hoveredUnclusteredId },
        { hover: false },
      );
    }
    hoveredUnclusteredId = null;
  });
}

// BỘ LỌC GẦN TÔI & DANH MỤC
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    e.target.classList.add("active");
    const cat = e.target.getAttribute("data-filter");

    if (cat === "all") {
      currentFilteredLocations = [...window.allLocations];
    } else if (cat === "near-me") {
      if (!userLocation) {
        if (window.Toast)
          window.Toast.show(
            "Đang chờ lấy vị trí GPS hoặc bạn chưa cấp quyền.",
            "info",
          );
        return;
      }
      const MAX_DISTANCE_KM = 5;
      const nearbyLocs = window.allLocations.filter((loc) => {
        const dist = getDistanceFromLatLonInKm(
          userLocation[1],
          userLocation[0],
          loc.geometry.coordinates[1],
          loc.geometry.coordinates[0],
        );
        loc.tempDistance = dist;
        return dist <= MAX_DISTANCE_KM;
      });
      nearbyLocs.sort((a, b) => a.tempDistance - b.tempDistance);
      currentFilteredLocations = nearbyLocs;

      if (nearbyLocs.length === 0 && window.Toast) {
        window.Toast.show(
          "Không tìm thấy địa điểm nào quanh bạn trong bán kính 5km.",
          "info",
        );
      }
    } else {
      currentFilteredLocations = window.allLocations.filter(
        (loc) => loc.properties.category === cat,
      );
    }
    updateMapSourceData();
  });
});

if (
  document.getElementById("btn-street") &&
  document.getElementById("btn-satellite")
) {
  document.getElementById("btn-street").addEventListener("click", (e) => {
    if (currentMapStyle === "streets-v12") return;
    currentMapStyle = "streets-v12";
    map.setStyle(`mapbox://styles/mapbox/${currentMapStyle}`);
    e.target.classList.add("active");
    document.getElementById("btn-satellite").classList.remove("active");
  });
  document.getElementById("btn-satellite").addEventListener("click", (e) => {
    if (currentMapStyle === "satellite-streets-v12") return;
    currentMapStyle = "satellite-streets-v12";
    map.setStyle(`mapbox://styles/mapbox/${currentMapStyle}`);
    e.target.classList.add("active");
    document.getElementById("btn-street").classList.remove("active");
  });
}

// ==========================================
// 6. TÌM KIẾM THÔNG MINH (FUZZY SEARCH & VOICE)
// ==========================================
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const voiceBtn = document.getElementById("voice-search-btn");

function removeVietnameseTones(str) {
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
  str = str.replace(/\u02C6|\u0306|\u031B/g, "");
  return str.trim();
}

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getFuzzyDistance(searchKey, target) {
  if (searchKey.length >= target.length)
    return getLevenshteinDistance(searchKey, target);
  let minDistance = Infinity;
  for (let i = 0; i <= target.length - searchKey.length; i++) {
    const sub = target.substring(i, i + searchKey.length);
    const dist = getLevenshteinDistance(searchKey, sub);
    if (dist < minDistance) minDistance = dist;
  }
  return minDistance;
}

function renderSearchList(locations, isSuggestion = false) {
  searchResults.innerHTML = "";
  searchResults.style.display = "block";

  if (isSuggestion) {
    const header = document.createElement("li");
    header.innerHTML = `<span style="font-size:12px; color:#ef4444; font-style:italic;">Có phải bạn muốn tìm:</span>`;
    header.style.pointerEvents = "none";
    header.style.background = "#fef2f2";
    searchResults.appendChild(header);
  }

  locations.forEach((loc) => {
    const li = document.createElement("li");
    li.innerHTML = `<i class="fa-solid fa-location-dot" style="${isSuggestion ? "color:#ef4444;" : ""}"></i> 
                    <div>
                      <span style="font-weight:600; display:block;">${loc.properties.name}</span>
                      <span style="font-size: 11px; color: #64748b;">${loc.properties.category}</span>
                    </div>`;
    li.addEventListener("click", () => {
      map.flyTo({ center: loc.geometry.coordinates, zoom: 15.5 });
      openLocationSidebar(loc);
      searchResults.style.display = "none";
      searchInput.value = loc.properties.name;
    });
    searchResults.appendChild(li);
  });
}

function handleSearchInput(val) {
  if (!val || !window.allLocations) {
    searchResults.style.display = "none";
    return;
  }

  const searchKey = removeVietnameseTones(val);

  const exactMatches = window.allLocations.filter((loc) => {
    const locName = removeVietnameseTones(loc.properties.name);
    const locCategory = removeVietnameseTones(loc.properties.category);
    return locName.includes(searchKey) || locCategory.includes(searchKey);
  });

  if (exactMatches.length > 0) {
    renderSearchList(exactMatches, false);
    return;
  }

  if (searchKey.length > 3) {
    const fuzzyMatches = window.allLocations
      .map((loc) => {
        const locName = removeVietnameseTones(loc.properties.name);
        const distance = getFuzzyDistance(searchKey, locName);
        return { ...loc, fuzzyScore: distance };
      })
      .filter((loc) => loc.fuzzyScore <= 2)
      .sort((a, b) => a.fuzzyScore - b.fuzzyScore)
      .slice(0, 3);

    if (fuzzyMatches.length > 0) {
      renderSearchList(fuzzyMatches, true);
    } else {
      searchResults.style.display = "none";
    }
  } else {
    searchResults.style.display = "none";
  }
}

if (searchInput && searchResults) {
  searchInput.addEventListener("input", (e) => {
    handleSearchInput(e.target.value);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#search-container"))
      searchResults.style.display = "none";
  });
}

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition && voiceBtn) {
  const recognition = new SpeechRecognition();
  recognition.lang = "vi-VN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  voiceBtn.addEventListener("click", () => {
    recognition.start();
  });

  recognition.onstart = function () {
    voiceBtn.classList.add("listening");
    searchInput.placeholder = "Đang nghe...";
    searchInput.value = "";
  };

  recognition.onspeechend = function () {
    recognition.stop();
    voiceBtn.classList.remove("listening");
    searchInput.placeholder = "Tìm kiếm địa điểm...";
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    searchInput.value = transcript;
    handleSearchInput(transcript);
  };

  recognition.onerror = function (event) {
    voiceBtn.classList.remove("listening");
    searchInput.placeholder = "Tìm kiếm địa điểm...";
    if (window.Toast) {
      if (event.error === "not-allowed") {
        window.Toast.show(
          "Vui lòng cấp quyền sử dụng Micro trên trình duyệt!",
          "error",
        );
      } else if (event.error === "no-speech") {
        window.Toast.show("Không nghe rõ, vui lòng thử lại.", "info");
      }
    }
  };
} else if (voiceBtn) {
  voiceBtn.style.display = "none";
}

// ==========================================
// 7. XÁC THỰC VÀ ĐÁNH GIÁ (GLOBAL AUTH)
// ==========================================
async function checkGlobalAuth() {
  if (!supabaseClient) return;
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const authSection = document.getElementById("auth-section");
    if (session && authSection) {
      currentAuthUser = session.user;
      const nameInput = document.getElementById("reviewer-name");
      if (nameInput) {
        nameInput.value =
          currentAuthUser.user_metadata?.full_name ||
          currentAuthUser.email.split("@")[0];
        nameInput.readOnly = true;
        nameInput.style.backgroundColor = "#e2e8f0";
      }

      const { data } = await supabaseClient
        .from("user_bookmarks")
        .select("location_id")
        .eq("user_id", currentAuthUser.id);
      if (data) userBookmarkedIds = data.map((d) => d.location_id);

      authSection.innerHTML = `
        <a href="#" id="btn-leaderboard-in" class="action-txt" style="color: #f59e0b; font-weight: 700; text-decoration: none;">
          <i class="fa-solid fa-trophy"></i> Xếp hạng
        </a>
        <div class="separator"></div>
        <span id="btn-show-bookmarks" class="action-txt"><i class="fa-solid fa-heart"></i> Đã lưu</span>
        <div class="separator"></div>
        <a href="dashboard.html" style="color: #10b981; font-weight: 600; text-decoration: none;" class="action-txt">
          <i class="fa-solid fa-chart-pie"></i> Quản trị
        </a>
        <div class="separator"></div>
        <a href="profile.html" style="color: #0052cc; font-weight: 600; text-decoration: none;" class="action-txt">
          <i class="fa-solid fa-user"></i> Hồ sơ
        </a>
        <div class="separator"></div>
        <span id="main-logout-btn" class="logout-txt action-txt"><i class="fa-solid fa-right-from-bracket"></i> Thoát</span>
      `;

      document
        .getElementById("main-logout-btn")
        .addEventListener("click", async () => {
          await supabaseClient.auth.signOut();
          location.reload();
        });

      document
        .getElementById("btn-show-bookmarks")
        .addEventListener("click", () => {
          renderBookmarksModal();
          document.getElementById("bookmarks-modal").classList.add("active");
        });
    }
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
  }
}
checkGlobalAuth();

async function loadLocationReviews(locId) {
  const reviewsList = document.getElementById("reviews-list");
  const reviewCount = document.getElementById("review-count");
  reviewsList.innerHTML =
    '<div style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>';
  reviewCount.textContent = "0";
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from("reviews")
      .select("*")
      .eq("location_id", locId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    reviewCount.textContent = data.length;
    if (data.length === 0) {
      reviewsList.innerHTML = "<p>Chưa có đánh giá.</p>";
      return;
    }

    reviewsList.innerHTML = data
      .map(
        (r) =>
          `<div class="review-item">
            <div class="review-header">
              <span class="reviewer-name">${r.guest_name}</span>
              <span class="review-stars">${"⭐".repeat(r.rating)}</span>
            </div>
            <p class="review-comment">${r.comment}</p>
            ${r.image_url ? `<img src="${r.image_url}" class="review-image-display" />` : ""}
          </div>`,
      )
      .join("");
  } catch (err) {
    reviewsList.innerHTML = "<p>Chưa thể tải đánh giá lúc này (Offline).</p>";
  }
}

const reviewImageInput = document.getElementById("review-image");
const reviewImgPreview = document.getElementById("review-img-preview");
if (reviewImageInput && reviewImgPreview) {
  reviewImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        reviewImgPreview.src = e.target.result;
        reviewImgPreview.style.display = "block";
      };
      reader.readAsDataURL(file);
    } else {
      reviewImgPreview.style.display = "none";
      reviewImgPreview.src = "";
    }
  });
}

document
  .getElementById("submit-review-btn")
  ?.addEventListener("click", async () => {
    if (!activeLocationId) return;
    const btn = document.getElementById("submit-review-btn");
    const name = document.getElementById("reviewer-name").value.trim();
    const rating = parseInt(document.getElementById("review-rating").value);
    const comment = document.getElementById("review-text").value.trim();
    const fileInput = document.getElementById("review-image");

    let file = null;
    if (fileInput && fileInput.files) {
      file = fileInput.files[0];
    }

    if (!navigator.onLine) {
      if (window.Toast)
        return window.Toast.show(
          "Bạn đang offline. Vui lòng kết nối mạng để gửi đánh giá!",
          "error",
        );
    }
    if (!name || !comment) {
      if (window.Toast)
        return window.Toast.show(
          "Vui lòng nhập đầy đủ tên và bình luận!",
          "info",
        );
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    let finalImageUrl = null;

    if (file) {
      const uploadStatus = document.getElementById("review-upload-status");
      if (uploadStatus) uploadStatus.style.display = "block";

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("review-images")
        .upload(fileName, file);

      if (uploadError) {
        if (window.Toast)
          window.Toast.show("Lỗi tải ảnh lên: " + uploadError.message, "error");
        btn.textContent = "Gửi đánh giá";
        btn.disabled = false;
        if (uploadStatus) uploadStatus.style.display = "none";
        return;
      }

      const { data: publicUrlData } = supabaseClient.storage
        .from("review-images")
        .getPublicUrl(fileName);

      finalImageUrl = publicUrlData.publicUrl;
      if (uploadStatus) uploadStatus.style.display = "none";
    }

    const payload = {
      location_id: activeLocationId,
      guest_name: name,
      rating: rating,
      comment: comment,
    };

    if (currentAuthUser) payload.user_id = currentAuthUser.id;
    if (finalImageUrl) payload.image_url = finalImageUrl;

    const { error } = await supabaseClient.from("reviews").insert([payload]);

    btn.textContent = "Gửi đánh giá";
    btn.disabled = false;

    if (error) {
      if (window.Toast) window.Toast.show("Lỗi: " + error.message, "error");
    } else {
      if (!currentAuthUser) document.getElementById("reviewer-name").value = "";
      document.getElementById("review-text").value = "";
      document.getElementById("review-rating").value = "5";

      if (reviewImageInput) reviewImageInput.value = "";
      if (reviewImgPreview) reviewImgPreview.style.display = "none";

      loadLocationReviews(activeLocationId);
    }
  });

// ==========================================
// 8. BẢNG XẾP HẠNG (LEADERBOARD) VÀ SỰ KIỆN CHUNG
// ==========================================
async function renderLeaderboard() {
  const listEl = document.getElementById("leaderboard-list");
  if (!listEl) return;
  listEl.innerHTML =
    '<div style="text-align:center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color: #0052cc"></i></div>';
  document.getElementById("leaderboard-modal").classList.add("active");

  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("check_ins")
    .select("user_name");

  if (error || !data) {
    listEl.innerHTML =
      '<p style="text-align:center; padding: 20px;">Không thể tải dữ liệu.</p>';
    return;
  }

  const counts = {};
  data.forEach((item) => {
    const name = item.user_name || "Người dùng ẩn danh";
    counts[name] = (counts[name] || 0) + 1;
  });

  const sortedLeaderboard = Object.keys(counts)
    .map((name) => ({ name, score: counts[name] }))
    .sort((a, b) => b.score - a.score);

  if (sortedLeaderboard.length === 0) {
    listEl.innerHTML =
      '<p style="text-align:center; padding: 20px;">Chưa có ai check-in trên hệ thống.</p>';
    return;
  }

  listEl.innerHTML = sortedLeaderboard
    .map((user, index) => {
      let rankClass = "";
      let rankIcon = index + 1;

      if (index === 0) {
        rankClass = "lb-rank-1";
        rankIcon = '<i class="fa-solid fa-medal"></i>';
      } else if (index === 1) {
        rankClass = "lb-rank-2";
        rankIcon = '<i class="fa-solid fa-medal"></i>';
      } else if (index === 2) {
        rankClass = "lb-rank-3";
        rankIcon = '<i class="fa-solid fa-medal"></i>';
      }

      return `
      <li class="lb-item">
        <div class="lb-rank ${rankClass}">${rankIcon}</div>
        <div class="lb-info"><p class="lb-name">${user.name}</p></div>
        <div class="lb-score">${user.score} Điểm</div>
      </li>
    `;
    })
    .join("");
}

document.getElementById("close-lb-modal")?.addEventListener("click", () => {
  document.getElementById("leaderboard-modal").classList.remove("active");
});

// Sử dụng Event Delegation để bắt sự kiện click cho cả 2 nút Bảng xếp hạng (lúc đăng nhập và chưa đăng nhập)
document.getElementById("auth-section")?.addEventListener("click", (e) => {
  const btnLb =
    e.target.closest("#btn-leaderboard-in") ||
    e.target.closest("#btn-leaderboard-out");
  if (btnLb) {
    e.preventDefault();
    renderLeaderboard();
  }
});
// ==========================================
// 9. THUẬT TOÁN LỊCH TRÌNH THÔNG MINH (TSP - V2)
// ==========================================
let itineraryMarkers = [];

// Bật Modal & Cá nhân hóa câu chào
document.getElementById("btn-open-itinerary")?.addEventListener("click", () => {
  const greetingEl = document.getElementById("itinerary-greeting");
  if (currentAuthUser && greetingEl) {
    const name =
      currentAuthUser.user_metadata?.full_name ||
      currentAuthUser.email.split("@")[0];
    greetingEl.innerHTML = `Chào ${name}, bạn muốn đi đâu?`;
  }
  document.getElementById("itinerary-modal").classList.add("active");
});

document
  .getElementById("close-itinerary-modal")
  ?.addEventListener("click", () => {
    document.getElementById("itinerary-modal").classList.remove("active");
  });

// Chạy thuật toán
document
  .getElementById("btn-generate-route")
  ?.addEventListener("click", async () => {
    if (!userLocation) {
      if (window.Toast)
        window.Toast.show(
          "Vui lòng bật định vị GPS để tạo lịch trình!",
          "error",
        );
      return;
    }

    const btnGen = document.getElementById("btn-generate-route");

    // Lấy các tham số cá nhân hóa
    const timeBudget = parseInt(
      document.querySelector('input[name="iti_time"]:checked').value,
    );
    const vehicle = document.querySelector(
      'input[name="iti_vehicle"]:checked',
    ).value; // driving hoặc walking
    const companion = document.querySelector(
      'input[name="iti_companion"]:checked',
    ).value;

    const prefs = Array.from(
      document.querySelectorAll(".iti-pref:checked"),
    ).map((cb) => cb.value);

    if (prefs.length === 0) {
      if (window.Toast)
        window.Toast.show("Vui lòng chọn ít nhất 1 sở thích!", "error");
      return;
    }

    // Lọc dữ liệu
    let candidates = window.allLocations.filter((loc) =>
      prefs.includes(loc.properties.category),
    );
    if (candidates.length === 0) {
      if (window.Toast)
        window.Toast.show("Không có địa điểm nào phù hợp.", "info");
      return;
    }

    btnGen.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang tính toán...';
    btnGen.disabled = true;

    // Tính số lượng điểm dừng (Tối ưu hóa theo thời gian và đối tượng)
    let maxStops = timeBudget === 2 ? 2 : timeBudget === 4 ? 4 : 6;
    // CÁ NHÂN HÓA: Nếu đi cùng gia đình, giảm bớt 1 điểm đến để lịch trình thong thả hơn
    if (companion === "family" && maxStops > 2) {
      maxStops -= 1;
    }
    if (candidates.length < maxStops) maxStops = candidates.length;

    // Thuật toán Greedy Nearest Neighbor
    let routePoints = [];
    let currentLoc = userLocation;
    let unvisited = [...candidates];

    for (let i = 0; i < maxStops; i++) {
      if (unvisited.length === 0) break;
      let nearestIdx = -1;
      let minDist = Infinity;

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
        let nextStop = unvisited[nearestIdx];
        routePoints.push(nextStop);
        currentLoc = nextStop.geometry.coordinates;
        unvisited.splice(nearestIdx, 1);
      }
    }

    // TỐI ƯU HÓA: Gọi API Mapbox theo đúng phương tiện (xe máy/ô tô hoặc đi bộ)
    let coordsString = userLocation[0] + "," + userLocation[1] + ";";
    coordsString += routePoints
      .map((p) => p.geometry.coordinates[0] + "," + p.geometry.coordinates[1])
      .join(";");

    try {
      // Truyền 'vehicle' (driving/walking) vào URL
      const url = `https://api.mapbox.com/directions/v5/mapbox/${vehicle}/${coordsString}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0].geometry;

        // Xóa hiển thị route cũ nếu có
        if (map.getSource("route-src"))
          map.getSource("route-src").setData(route);

        // Zoom vừa vặn màn hình
        const bounds = route.coordinates.reduce(
          (b, coord) => b.extend(coord),
          new mapboxgl.LngLatBounds(route.coordinates[0], route.coordinates[0]),
        );
        map.fitBounds(bounds, { padding: 80 });

        // Cập nhật Markers 1, 2, 3...
        itineraryMarkers.forEach((m) => m.remove());
        itineraryMarkers = [];

        routePoints.forEach((p, index) => {
          const el = document.createElement("div");
          el.className = "itinerary-marker";
          el.innerText = index + 1;

          const marker = new mapboxgl.Marker(el)
            .setLngLat(p.geometry.coordinates)
            .addTo(map);

          el.addEventListener("click", () => openLocationSidebar(p));
          itineraryMarkers.push(marker);
        });

        document.getElementById("itinerary-modal").classList.remove("active");
        if (window.Toast)
          window.Toast.show(
            `Thành công! Lộ trình ${routePoints.length} điểm đã được vẽ trên bản đồ.`,
            "success",
          );
      } else {
        if (window.Toast)
          window.Toast.show("Không thể nối đường giữa các điểm này.", "error");
      }
    } catch (e) {
      if (window.Toast) window.Toast.show("Lỗi mạng khi gọi Mapbox.", "error");
    } finally {
      btnGen.innerHTML = '<i class="fa-solid fa-route"></i> Bắt đầu chuyến đi!';
      btnGen.disabled = false;
    }
  });

// ==========================================
// ĐIỀU KHIỂN NÚT 3 GẠCH (MENU LỌC DI ĐỘNG)
// ==========================================
document
  .getElementById("mobile-filter-toggle")
  ?.addEventListener("click", () => {
    document.getElementById("filter-menu").classList.toggle("show");
  });

// Trải nghiệm App: Khi bấm chọn 1 Danh mục, Menu tự động thu lại
document.querySelectorAll("#filter-menu .filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("filter-menu").classList.remove("show");
  });
});
