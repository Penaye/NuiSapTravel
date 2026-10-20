// =========================================================================
// PHASE 2 ENGINE: STATISTICAL PRICE VERIFICATION & SMART TRIP PLANNER V2
// =========================================================================

window.Phase2Engine = {
  CONFIG: {
    MIN_SAMPLE_FOR_ALERT: 3,
    ALERT_DEVIATION_PERCENT: 15,
    LOOKBACK_DAYS: 90,
    CONDITION_LABELS: {
      normal: "Ngày thường",
      weekend: "Cuối tuần",
      holiday: "Lễ / Tết",
      peak_season: "Mùa cao điểm",
    },
  },

  escapeHTML: function (str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  sanitizeUrl: function (url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (
      /^https?:\/\//i.test(trimmed) ||
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)
    ) {
      return trimmed;
    }
    return "";
  },

  formatCurrency: function (val) {
    const num = Number(val);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("vi-VN").format(Math.round(num));
  },

  calculateQuantiles: function (values) {
    const valid = (values || [])
      .map((v) => Number(v))
      .filter((v) => !isNaN(v) && isFinite(v) && v >= 0)
      .sort((a, b) => a - b);

    const n = valid.length;
    if (n === 0) {
      return {
        count: 0,
        median: null,
        q1: null,
        q3: null,
        iqr: null,
        min: null,
        max: null,
      };
    }

    const getPercentile = (arr, p) => {
      const idx = (arr.length - 1) * p;
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      const weight = idx - lower;
      return arr[lower] * (1 - weight) + arr[upper] * weight;
    };

    const median = getPercentile(valid, 0.5);
    const q1 = getPercentile(valid, 0.25);
    const q3 = getPercentile(valid, 0.75);
    const iqr = q3 - q1;

    return {
      count: n,
      median: Math.round(median),
      q1: Math.round(q1),
      q3: Math.round(q3),
      iqr: Math.round(iqr),
      min: valid[0],
      max: valid[n - 1],
      sortedValues: valid,
    };
  },

  filterOutliersIQR: function (values) {
    const baseStats = this.calculateQuantiles(values);
    if (baseStats.count < 4 || baseStats.iqr === 0) {
      return {
        filteredValues: baseStats.sortedValues || [],
        outliers: [],
        stats: baseStats,
      };
    }

    const lowerFence = baseStats.q1 - 1.5 * baseStats.iqr;
    const upperFence = baseStats.q3 + 1.5 * baseStats.iqr;

    const filteredValues = [];
    const outliers = [];

    baseStats.sortedValues.forEach((v) => {
      if (v < lowerFence || v > upperFence) outliers.push(v);
      else filteredValues.push(v);
    });

    return {
      filteredValues,
      outliers,
      stats: this.calculateQuantiles(
        filteredValues.length > 0 ? filteredValues : baseStats.sortedValues,
      ),
    };
  },

  evaluatePriceItem: function (
    listedItem,
    communityReports,
    configOverrides = {},
  ) {
    const cfg = { ...this.CONFIG, ...configOverrides };
    const listedMin = Number(listedItem.price_min) || 0;
    const listedMax = Number(listedItem.price_max) || listedMin;
    const listedCondition = listedItem.condition_type || "normal";

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - cfg.LOOKBACK_DAYS * 86400000);

    const matchingReports = (communityReports || []).filter((r) => {
      if (r.is_test_data === true) return false;
      const reportDate = new Date(r.transaction_date || r.created_at);
      if (isNaN(reportDate.getTime()) || reportDate < cutoffDate) return false;

      if (r.price_item_id && Number(r.price_item_id) === Number(listedItem.id))
        return true;
      const sameName =
        (r.service_name || "").trim().toLowerCase() ===
        (listedItem.item_name || "").trim().toLowerCase();
      const sameUnit =
        (r.unit || "").trim().toLowerCase() ===
        (listedItem.unit || "").trim().toLowerCase();
      return sameName && sameUnit;
    });

    const verifiedReports = matchingReports.filter(
      (r) => r.moderation_status === "approved",
    );
    const unverifiedReports = matchingReports.filter(
      (r) => r.moderation_status === "pending",
    );

    const sameConditionVerified = verifiedReports.filter(
      (r) => (r.condition_type || "normal") === listedCondition,
    );
    const seasonalVerified = verifiedReports.filter(
      (r) => (r.condition_type || "normal") !== listedCondition,
    );

    const primaryPool =
      sameConditionVerified.length > 0
        ? sameConditionVerified
        : verifiedReports;
    const rawPrices = primaryPool.map((r) => Number(r.actual_price));
    const { stats, outliers } = this.filterOutliersIQR(rawPrices);

    let dateRangeText = "Chưa có mẫu";
    if (primaryPool.length > 0) {
      const dates = primaryPool
        .map((r) => new Date(r.transaction_date || r.created_at))
        .sort((a, b) => a - b);
      const fmtDate = (d) => d.toLocaleDateString("vi-VN");
      dateRangeText =
        dates.length === 1
          ? fmtDate(dates[0])
          : `${fmtDate(dates[0])} - ${fmtDate(dates[dates.length - 1])}`;
    }

    let deviationPercent = 0;
    if (stats.median !== null && listedMax > 0) {
      deviationPercent = Number(
        (((stats.median - listedMax) / listedMax) * 100).toFixed(1),
      );
    }

    let status = "no_data";
    let statusMessage = "Chưa có dữ liệu thực trả đã xác minh.";

    if (stats.count > 0 && stats.count < cfg.MIN_SAMPLE_FOR_ALERT) {
      status = "insufficient_sample";
      statusMessage = `Đang thu thập mẫu (${stats.count}/${cfg.MIN_SAMPLE_FOR_ALERT} mẫu xác minh). Chưa đủ ngưỡng kết luận.`;
    } else if (stats.count >= cfg.MIN_SAMPLE_FOR_ALERT) {
      if (deviationPercent > cfg.ALERT_DEVIATION_PERCENT) {
        if (sameConditionVerified.length === 0 && seasonalVerified.length > 0) {
          status = "seasonal_diff";
          statusMessage = `Trung vị thực trả cao hơn ${deviationPercent}% nhưng ghi nhận vào dịp Lễ/Tết/Cuối tuần.`;
        } else {
          status = "warning_high";
          statusMessage = `Cảnh báo thống kê: Trung vị thực trả vượt +${deviationPercent}% so với trần niêm yết (trên ${stats.count} mẫu xác minh).`;
        }
      } else {
        status = "normal";
        statusMessage = `Phù hợp với giá niêm yết (${stats.count} mẫu xác minh).`;
      }
    }

    return {
      listedMin,
      listedMax,
      listedCondition,
      verifiedCount: stats.count,
      unverifiedCount: unverifiedReports.length,
      medianPrice: stats.median,
      q1Price: stats.q1,
      q3Price: stats.q3,
      outlierCount: outliers.length,
      dateRangeText,
      deviationPercent,
      status,
      statusMessage,
    };
  },

  // 4. THUẬT TOÁN THÔNG MINH V2: TIME-SLOTTED MULTI-CRITERIA ROUTING & BUDGETING
  calculateTripBudget: function (params, allLocations, allPriceItems) {
    const people = Math.max(1, parseInt(params.people) || 1);
    const days = Math.max(0.25, parseFloat(params.days) || 1);
    const mealsPerDay = Math.max(0, parseInt(params.mealsPerDay) ?? 2);
    const needStay = params.needStay === true || params.needStay === "true";
    const maxBudgetTotal = parseFloat(params.maxBudget) || 0;
    const userCoords = params.userLocation || [105.267768, 10.262644];
    const vehicle = params.vehicle || "driving";
    const conditionType = params.conditionType || "normal";
    const bookmarkedIds = Array.isArray(params.bookmarkedIds)
      ? params.bookmarkedIds.map(Number)
      : [];
    const prioritizeBookmarks = params.prioritizeBookmarks !== false;
    const excludedIds = Array.isArray(params.excludedIds)
      ? params.excludedIds.map(Number)
      : [];

    const preferences =
      Array.isArray(params.preferences) && params.preferences.length > 0
        ? params.preferences
        : ["Du lịch", "Quán ăn"];

    const nights = needStay ? Math.max(1, Math.floor(days)) : 0;
    const roomsNeeded = needStay ? Math.ceil(people / 2) : 0;

    const locMap = {};
    (allLocations || []).forEach((loc) => {
      const id = loc.id || loc.properties?.id;
      locMap[id] = loc;
    });

    // Ưu tiên lấy giá phù hợp với thời điểm đi (Ngày thường / Cuối tuần / Lễ Tết)
    const filteredPrices = (allPriceItems || []).filter((p) => {
      if (!p.condition_type || p.condition_type === "normal") return true;
      return p.condition_type === conditionType;
    });
    const pricePool =
      filteredPrices.length > 0 ? filteredPrices : allPriceItems || [];

    const foodItems = [];
    const stayItems = [];
    const tourItems = [];

    pricePool.forEach((item) => {
      const loc = locMap[item.location_id];
      if (!loc) return;
      const cat = loc.properties?.category || loc.category || "";
      if (cat === "Quán ăn") foodItems.push(item);
      else if (cat === "Khách sạn") stayItems.push(item);
      else if (cat === "Du lịch") tourItems.push(item);
    });

    const haversineKm = (lat1, lon1, lat2, lon2) => {
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
    };

    const perPersonBudgetLimit =
      maxBudgetTotal > 0 ? maxBudgetTotal / people : Infinity;

    // Chuẩn bị danh sách ứng viên giàu thông tin
    const enrichedCandidates = (allLocations || [])
      .map((loc) => {
        const locId = Number(loc.id || loc.properties?.id);
        const coords = loc.geometry?.coordinates || [loc.lng, loc.lat];
        const cat = loc.properties?.category || loc.category || "Khác";
        const locPrices = pricePool.filter(
          (p) => Number(p.location_id) === locId,
        );

        let minCostPerUnit = 0;
        let maxCostPerUnit = 0;
        if (locPrices.length > 0) {
          minCostPerUnit = Math.min(
            ...locPrices.map((p) => Number(p.price_min) || 0),
          );
          maxCostPerUnit = Math.max(
            ...locPrices.map((p) => Number(p.price_max) || 0),
          );
        }

        const isBookmarked = bookmarkedIds.includes(locId);

        return {
          rawFeature: loc,
          id: locId,
          name: loc.properties?.name || loc.name,
          category: cat,
          hasPriceData: locPrices.length > 0,
          minCostPerUnit,
          maxCostPerUnit,
          coordinates: coords,
          isBookmarked,
        };
      })
      .filter(
        (item) =>
          preferences.includes(item.category) &&
          !excludedIds.includes(item.id) &&
          item.minCostPerUnit <= perPersonBudgetLimit,
      );

    // Xây dựng Kịch bản Khung giờ (Time-Slotted Sequence) thông minh thay vì chọn ngẫu nhiên
    const desiredSlots = [];
    if (days <= 0.3) {
      // 2 Tiếng
      if (preferences.includes("Du lịch"))
        desiredSlots.push({
          cat: "Du lịch",
          slotLabel: "08:00 - 09:15 • Tham quan chính",
        });
      if (preferences.includes("Quán ăn") && mealsPerDay > 0)
        desiredSlots.push({
          cat: "Quán ăn",
          slotLabel: "09:20 - 10:00 • Thưởng thức ẩm thực / Giải khát",
        });
      else if (preferences.includes("Du lịch"))
        desiredSlots.push({
          cat: "Du lịch",
          slotLabel: "09:20 - 10:00 • Điểm tham quan kế tiếp",
        });
    } else if (days <= 0.6) {
      // Nửa ngày
      if (preferences.includes("Du lịch"))
        desiredSlots.push({
          cat: "Du lịch",
          slotLabel: "08:00 - 09:30 • Điểm tham quan mở đầu",
        });
      if (preferences.includes("Du lịch"))
        desiredSlots.push({
          cat: "Du lịch",
          slotLabel: "09:45 - 11:00 • Khám phá văn hóa / sinh thái",
        });
      if (preferences.includes("Quán ăn") && mealsPerDay > 0)
        desiredSlots.push({
          cat: "Quán ăn",
          slotLabel: "11:15 - 12:30 • Nghỉ ngơi & Ăn trưa",
        });
    } else {
      // 1 Ngày trở lên
      if (preferences.includes("Du lịch"))
        desiredSlots.push({
          cat: "Du lịch",
          slotLabel: "08:00 - 10:30 • Tham quan buổi sáng",
        });
      if (preferences.includes("Quán ăn") && mealsPerDay >= 1)
        desiredSlots.push({
          cat: "Quán ăn",
          slotLabel: "11:00 - 12:45 • Ăn trưa & Nghỉ ngơi",
        });
      if (preferences.includes("Du lịch"))
        desiredSlots.push({
          cat: "Du lịch",
          slotLabel: "13:30 - 16:30 • Tham quan buổi chiều",
        });
      if (preferences.includes("Quán ăn") && mealsPerDay >= 2)
        desiredSlots.push({
          cat: "Quán ăn",
          slotLabel: "17:00 - 18:30 • Ẩm thực buổi chiều/tối",
        });
      if (needStay || preferences.includes("Khách sạn"))
        desiredSlots.push({
          cat: "Khách sạn",
          slotLabel: "19:00 • Nhận phòng lưu trú nghỉ đêm",
        });
    }

    // Nếu người dùng chỉ chọn 1 loại địa điểm (VD chỉ chọn Quán ăn), tự lấp đầy bằng loại đó
    if (desiredSlots.length === 0) {
      const defaultCat = preferences[0] || "Du lịch";
      desiredSlots.push(
        { cat: defaultCat, slotLabel: "Chặng 1 • Khởi hành" },
        { cat: defaultCat, slotLabel: "Chặng 2 • Tiếp nối" },
        { cat: defaultCat, slotLabel: "Chặng 3 • Kết thúc" },
      );
    }

    const plannedRoute = [];
    let currentCoords = [...userCoords];
    const unvisited = [...enrichedCandidates];
    const speedKmh = vehicle === "walking" ? 4.5 : 28; // Tốc độ trung bình nội thị

    desiredSlots.forEach((slot) => {
      if (unvisited.length === 0) return;

      // Tìm ứng viên đúng phân loại của khung giờ, nếu hết thì lấy phân loại bất kỳ còn lại
      let pool = unvisited.filter((u) => u.category === slot.cat);
      if (pool.length === 0) pool = unvisited;

      // Chấm điểm thông minh: Khoảng cách gần + Ưu tiên điểm Đã lưu + Có bảng giá minh bạch
      let bestCandidate = null;
      let bestScore = Infinity;

      pool.forEach((cand) => {
        const dist = haversineKm(
          currentCoords[1],
          currentCoords[0],
          cand.coordinates[1],
          cand.coordinates[0],
        );
        // Điểm càng thấp càng tốt (Quy đổi ưu tiên thành giảm khoảng cách ảo)
        let score = dist;
        if (prioritizeBookmarks && cand.isBookmarked) score -= 2.5;
        if (cand.hasPriceData) score -= 0.4;

        if (score < bestScore) {
          bestScore = score;
          bestCandidate = { cand, actualDist: dist };
        }
      });

      if (bestCandidate) {
        const chosen = bestCandidate.cand;
        const distKm = Number(bestCandidate.actualDist.toFixed(2));
        const travelMinutes = Math.max(2, Math.round((distKm / speedKmh) * 60));

        // Đếm xem còn bao nhiêu ứng viên thay thế cùng loại
        const alternativesCount = unvisited.filter(
          (u) => u.category === chosen.category && u.id !== chosen.id,
        ).length;

        plannedRoute.push({
          ...chosen,
          stepOrder: plannedRoute.length + 1,
          slotLabel: slot.slotLabel,
          legDistanceKm: distKm,
          travelMinutes,
          alternativesCount,
        });

        currentCoords = [...chosen.coordinates];
        const removeIdx = unvisited.findIndex((u) => u.id === chosen.id);
        if (removeIdx !== -1) unvisited.splice(removeIdx, 1);
      }
    });

    const totalDistanceKm = Number(
      plannedRoute.reduce((sum, r) => sum + r.legDistanceKm, 0).toFixed(2),
    );
    const totalTravelMinutes = plannedRoute.reduce(
      (sum, r) => sum + r.travelMinutes,
      0,
    );

    const breakdown = [];
    const missingDataNotes = [];

    // 4.1. Chi phí Ăn uống
    let foodMin = 0,
      foodMax = 0;
    const totalMeals =
      mealsPerDay === 0 ? 0 : days < 0.5 ? 1 : Math.ceil(days * mealsPerDay);

    if (totalMeals > 0) {
      if (foodItems.length > 0) {
        const minPrices = foodItems
          .map((i) => Number(i.price_min))
          .filter((v) => v > 0);
        const maxPrices = foodItems
          .map((i) => Number(i.price_max))
          .filter((v) => v > 0);
        const qFoodMin = this.calculateQuantiles(minPrices);
        const qFoodMax = this.calculateQuantiles(maxPrices);

        const perMealMin = qFoodMin.q1 || qFoodMin.median || 35000;
        const perMealMax = qFoodMax.q3 || qFoodMax.median || 80000;

        foodMin = people * totalMeals * perMealMin;
        foodMax = people * totalMeals * perMealMax;

        breakdown.push({
          category: "🍜 Ăn uống & Giải khát",
          hasData: true,
          sampleSize: foodItems.length,
          min: foodMin,
          max: foodMax,
          detail: `${people} người × ${totalMeals} bữa (Dựa trên ${foodItems.length} mức giá niêm yết)`,
        });
      } else {
        missingDataNotes.push(
          "Khoản Ăn uống: Chưa có dữ liệu bảng giá từ các quán ăn trên hệ thống.",
        );
        breakdown.push({
          category: "🍜 Ăn uống & Giải khát",
          hasData: false,
          sampleSize: 0,
          min: 0,
          max: 0,
          detail: "Chưa có dữ liệu giá niêm yết trên hệ thống",
        });
      }
    }

    // 4.2. Chi phí Lưu trú
    let stayMin = 0,
      stayMax = 0;
    if (needStay && nights > 0) {
      if (stayItems.length > 0) {
        const minPrices = stayItems
          .map((i) => Number(i.price_min))
          .filter((v) => v > 0);
        const maxPrices = stayItems
          .map((i) => Number(i.price_max))
          .filter((v) => v > 0);
        const qStayMin = this.calculateQuantiles(minPrices);
        const qStayMax = this.calculateQuantiles(maxPrices);

        const roomMin = qStayMin.min || 200000;
        const roomMax = qStayMax.max || 500000;

        stayMin = roomsNeeded * nights * roomMin;
        stayMax = roomsNeeded * nights * roomMax;

        breakdown.push({
          category: "🏨 Lưu trú qua đêm",
          hasData: true,
          sampleSize: stayItems.length,
          min: stayMin,
          max: stayMax,
          detail: `${roomsNeeded} phòng × ${nights} đêm (Từ ${stayItems.length} mức giá khách sạn/nhà nghỉ)`,
        });
      } else {
        missingDataNotes.push(
          "Khoản Lưu trú: Chưa có bảng giá khách sạn/nhà nghỉ trong cơ sở dữ liệu.",
        );
        breakdown.push({
          category: "🏨 Lưu trú qua đêm",
          hasData: false,
          sampleSize: 0,
          min: 0,
          max: 0,
          detail: "Chưa có dữ liệu giá niêm yết trên hệ thống",
        });
      }
    }

    // 4.3. Chi phí Vé tham quan & Dịch vụ
    let tourMin = 0,
      tourMax = 0;
    if (tourItems.length > 0) {
      const minPrices = tourItems.map((i) => Number(i.price_min));
      const maxPrices = tourItems.map((i) => Number(i.price_max));
      const qTourMin = this.calculateQuantiles(minPrices);
      const qTourMax = this.calculateQuantiles(maxPrices);

      const estStops = Math.max(
        1,
        plannedRoute.filter((r) => r.category === "Du lịch").length || 1,
      );
      tourMin = people * estStops * (qTourMin.q1 || 0);
      tourMax = people * estStops * (qTourMax.q3 || 40000);

      breakdown.push({
        category: "🎟️ Vé tham quan & Dịch vụ",
        hasData: true,
        sampleSize: tourItems.length,
        min: tourMin,
        max: tourMax,
        detail: `Ước tính ${estStops} điểm tham quan × ${people} người (${tourItems.length} mục giá niêm yết)`,
      });
    } else {
      breakdown.push({
        category: "🎟️ Vé tham quan & Dịch vụ",
        hasData: true,
        sampleSize: 0,
        min: 0,
        max: 0,
        detail: "Các điểm tâm linh / công cộng mở cửa miễn phí vào cổng",
      });
    }

    const totalMin = foodMin + stayMin + tourMin;
    const totalMax = foodMax + stayMax + tourMax;

    return {
      people,
      days,
      nights,
      roomsNeeded,
      totalMin,
      totalMax,
      perPersonMin: Math.round(totalMin / people),
      perPersonMax: Math.round(totalMax / people),
      totalDistanceKm,
      totalTravelMinutes,
      withinUserBudget: maxBudgetTotal > 0 ? totalMin <= maxBudgetTotal : null,
      maxBudgetTotal,
      breakdown,
      missingDataNotes,
      recommendedLocations: plannedRoute,
      algorithmLimitation:
        "Lộ trình được phân bổ theo khung giờ sinh học (Tham quan - Ăn uống - Lưu trú) kết hợp khoảng cách Haversine gần nhất và ưu tiên điểm Đã lưu.",
    };
  },
};
