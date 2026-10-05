window.DashboardMap = {
  miniMap: null,
  miniMarker: null,

  init: function () {
    if (this.miniMap) return;

    mapboxgl.accessToken =
      "pk.eyJ1IjoidGFuZGF0MjAwOSIsImEiOiJjbXVtYWF1NGowMGNmMnlvbW9ndjJzNGkwIn0.wNCub38RhKYzfaod_-21VA";

    this.miniMap = new mapboxgl.Map({
      container: "mini-map",
      style: "mapbox://styles/mapbox/streets-v12",
      center: [105.267768, 10.262644],
      zoom: 13,
    });

    this.miniMap.addControl(new mapboxgl.NavigationControl(), "top-right");

    this.miniMap.on("click", (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;

      document.getElementById("loc-lng").value = lng;
      document.getElementById("loc-lat").value = lat;

      this.setMarker(lng, lat);
    });
  },

  setMarker: function (lng, lat) {
    if (this.miniMarker) this.miniMarker.remove();
    this.miniMarker = new mapboxgl.Marker({ color: "#ef4444" })
      .setLngLat([lng, lat])
      .addTo(this.miniMap);
  },

  resetMap: function () {
    if (this.miniMarker) this.miniMarker.remove();
    if (this.miniMap) {
      this.miniMap.resize();
      this.miniMap.flyTo({ center: [105.267768, 10.262644], zoom: 13 });
    }
  },
};
