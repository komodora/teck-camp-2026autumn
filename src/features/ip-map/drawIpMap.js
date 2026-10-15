import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from "maplibre-gl";
import { countryName } from "../../../locateIpv4.js";
import { formatCount } from "../../lib/format.js";
import styles from "./IpMap.module.css";

const MIN_CIRCLE_RADIUS = 7;
const MAX_CIRCLE_RADIUS = 40;
const CLIENT_ERROR_COLOR = "#c81e1e";
const SUCCESS_COLOR = "#1f8a3b";
const OVERLAP_SEPARATION_MIN_ZOOM = 4;
const SKY_COLOR = "#d6e4ee";

const openStreetMapGlobeStyle = {
  version: 8,
  // MapLibre 6 では投影を style で指定する。globe は広域では球体、拡大するとメルカトルへ寄る。
  projection: { type: "globe" },
  sky: {
    "sky-color": SKY_COLOR,
    "horizon-color": "#eef5f8",
    "sky-horizon-blend": 0.5,
    "atmosphere-blend": 0.7,
  },
  sources: {
    openstreetmap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: "sky-background",
      type: "background",
      paint: { "background-color": SKY_COLOR },
    },
    {
      id: "openstreetmap",
      type: "raster",
      source: "openstreetmap",
    },
  ],
};

export function drawIpMap(container) {
  const map = new MapLibreMap({
    container,
    style: openStreetMapGlobeStyle,
    center: [0, 20],
    zoom: 1.2,
    maxZoom: 19,
    renderWorldCopies: false,
    canvasContextAttributes: { antialias: true },
    locale: {
      "NavigationControl.ZoomIn": "拡大",
      "NavigationControl.ZoomOut": "縮小",
      "NavigationControl.ResetBearing": "北を上にする",
      "Popup.Close": "閉じる",
    },
  });
  map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");

  const markerByKey = new Map();
  let markers = [];
  let pendingCircles = [];
  let radiusBasisCount = 1;
  let pendingFit = [];
  let mapLoaded = false;
  let hasFitted = false;

  const placeWhenReady = () => {
    if (!mapLoaded) return;
    placeCircles(map, markers);
  };

  function applyCircles() {
    if (!mapLoaded) return;
    if (!hasFitted && pendingFit.length > 0) {
      fitLngLats(map, pendingFit);
      hasFitted = true;
    }
    markers = syncCircleMarkers(map, markerByKey, pendingCircles, radiusBasisCount);
    placeCircles(map, markers);
  }

  map.on("load", () => {
    mapLoaded = true;
    requestAnimationFrame(applyCircles);
  });
  // ドラッグで地球儀を回すと画面上の位置が変わるので、ズーム後だけでなく移動後も置く。
  map.on("zoomend", placeWhenReady);
  map.on("moveend", placeWhenReady);

  return {
    // 時間を進めても地球儀の向きを保つ。初回とデータの取り直しだけ全体が収まる位置へ寄せる。
    fitLocations(circles) {
      pendingFit = circles.map((circle) => circleLngLat(circle));
      hasFitted = false;
      applyCircles();
    },
    setCircles(circles, nextRadiusBasisCount) {
      pendingCircles = circles;
      radiusBasisCount = nextRadiusBasisCount;
      applyCircles();
    },
    destroy() {
      map.remove();
    },
  };
}

function syncCircleMarkers(map, markerByKey, circles, radiusBasisCount) {
  const nextKeys = new Set();
  const sorted = circles.slice().sort((left, right) => right.count - left.count);

  for (const circle of sorted) {
    const key = `${circle.ip}:${circle.statusClass}`;
    nextKeys.add(key);
    const radius = circleRadius(circle.count, radiusBasisCount);
    const existing = markerByKey.get(key);
    if (existing) {
      updateCircleMarker(existing, circle, radius);
      continue;
    }
    markerByKey.set(key, createCircleMarker(map, circle, radius));
  }

  for (const [key, item] of markerByKey) {
    if (nextKeys.has(key)) continue;
    item.marker.remove();
    markerByKey.delete(key);
  }

  return sorted.map((circle) => markerByKey.get(`${circle.ip}:${circle.statusClass}`));
}

function fitLngLats(map, lngLats) {
  map.resize();
  if (lngLats.length === 1) {
    map.jumpTo({ center: lngLats[0], zoom: 3 });
    return;
  }

  // 経度をそのまま包むと日付変更線をまたぐ2点がアフリカ側の長い弧になる。近い経度へ寄せて短い方を収める。
  const anchorLongitude = lngLats[0][0];
  const bounds = new LngLatBounds();
  for (const lngLat of lngLats) {
    bounds.extend([longitudeNear(lngLat[0], anchorLongitude), lngLat[1]]);
  }
  map.fitBounds(bounds, { padding: 56, animate: false, maxZoom: 4 });
}

function longitudeNear(longitude, anchorLongitude) {
  const delta = (((longitude - anchorLongitude + 180) % 360) + 360) % 360 - 180;
  return anchorLongitude + delta;
}

function createCircleMarker(map, circle, radius) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = styles.circle;
  paintCircleElement(element, circle, radius);

  const marker = new Marker({ element, anchor: "center" })
    .setLngLat(circleLngLat(circle))
    .setPopup(
      new Popup({ className: "ip-popup-wrap", offset: radius, maxWidth: "260px" }).setHTML(popupHtml(circle)),
    )
    .addTo(map);

  return { marker, radius, origin: circleLngLat(circle) };
}

function updateCircleMarker(item, circle, radius) {
  paintCircleElement(item.marker.getElement(), circle, radius);
  item.radius = radius;
  const popup = item.marker.getPopup();
  popup.setHTML(popupHtml(circle));
  popup.setOffset(radius);
}

function paintCircleElement(element, circle, radius) {
  const color = circle.statusClass === "4xx" ? CLIENT_ERROR_COLOR : SUCCESS_COLOR;
  element.style.width = `${radius * 2}px`;
  element.style.height = `${radius * 2}px`;
  element.style.color = color;
  element.setAttribute("aria-label", `${circle.ip}の件数`);
}

function placeCircles(map, markers) {
  if (map.getZoom() < OVERLAP_SEPARATION_MIN_ZOOM) {
    for (const item of markers) {
      item.marker.setLngLat(item.origin);
      setCircleVisible(map, item);
    }
    return;
  }

  const placed = [];
  for (const item of markers) {
    if (!isOnVisibleGlobe(map, item.origin)) {
      item.marker.setLngLat(item.origin);
      setCircleVisible(map, item);
      continue;
    }

    const originPoint = map.project(item.origin);
    let point = originPoint;
    let step = 0;
    while (placed.some((other) => pixelDistance(other.point, point) < other.radius + item.radius + 3)) {
      step += 1;
      const angle = step * 2.399;
      const distance = 8 + step * 2;
      point = { x: originPoint.x + Math.cos(angle) * distance, y: originPoint.y + Math.sin(angle) * distance };
      if (step > 48) break;
    }
    placed.push({ point, radius: item.radius });
    item.marker.setLngLat(map.unproject([point.x, point.y]));
    setCircleVisible(map, item);
  }
}

function setCircleVisible(map, item) {
  const visible = isOnVisibleGlobe(map, item.marker.getLngLat());
  item.marker.getElement().style.visibility = visible ? "visible" : "hidden";
  const popup = item.marker.getPopup();
  if (!visible && popup?.isOpen()) popup.remove();
}

function isOnVisibleGlobe(map, lngLat) {
  const screenPoint = map.project(lngLat);
  const surface = map.unproject(screenPoint);
  const [longitude, latitude] = lngLatPair(lngLat);
  // 裏側の点は手前の地表に投影される。往復して元の座標へ戻る点だけ球体の表にいる。
  return shortestLongitudeDelta(longitude, surface.lng) < 1 && Math.abs(latitude - surface.lat) < 1;
}

function lngLatPair(lngLat) {
  if (Array.isArray(lngLat)) return lngLat;
  return [lngLat.lng, lngLat.lat];
}

function shortestLongitudeDelta(left, right) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function circleLngLat(circle) {
  return [circle.longitude, circle.latitude];
}

function circleRadius(count, largestCount) {
  if (largestCount <= 1) return MIN_CIRCLE_RADIUS;
  const scale = Math.sqrt(count / largestCount);
  return MIN_CIRCLE_RADIUS + (MAX_CIRCLE_RADIUS - MIN_CIRCLE_RADIUS) * scale;
}

function popupHtml(circle) {
  const country = countryName(circle.countryCode);
  const classLabel = circle.statusClass === "4xx" ? "この円は400系" : "この円は200系";
  const countryLine = country === "" ? "" : `${escapeHtml(country)}<br>`;
  return `<div class="ip-popup">
    <strong>${escapeHtml(circle.ip)}</strong><br>
    400系 ${formatCount(circle.status4xxCount)}件<br>
    200系 ${formatCount(circle.status2xxCount)}件<br>
    ${countryLine}
    <span class="popup-note">${classLabel} ${formatCount(circle.count)}件</span>
  </div>`;
}

function pixelDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
