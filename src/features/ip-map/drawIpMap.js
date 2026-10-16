import { Map as MapLibreMap, Marker, NavigationControl, Popup } from "maplibre-gl";
import { countryName } from "../../../locateIpv4.js";
import { formatCount } from "../../lib/format.js";
import { createCameraFollow } from "./cameraFollow.js";
import styles from "./IpMap.module.css";

const MIN_CIRCLE_RADIUS = 7;
// 消える円は縮みながら薄れてから外す。IpMap.module.css の .leaving と同じ長さにする。
const LEAVE_MS = 300;
const MAX_CIRCLE_RADIUS = 40;
const CLIENT_ERROR_COLOR = "#c81e1e";
const SUCCESS_COLOR = "#1f8a3b";
const OVERLAP_SEPARATION_MIN_ZOOM = 4;
const SKY_COLOR = "#d6e4ee";

const openStreetMapGlobeStyle = {
  version: 8,
  // MapLibre 6 では投影を style で指定する。初期表示は地球儀で、画面から平面地図へ切り替えられる。
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

  let notifyFollowInterrupted = () => {};
  const follow = createCameraFollow(map, { onInterrupted: () => notifyFollowInterrupted() });

  const markerByKey = new Map();
  let markers = [];
  let pendingCircles = [];
  let radiusBasisCount = 1;
  let pendingFit = [];
  let mapLoaded = false;
  let hasFitted = false;
  let pendingProjection = "globe";
  let projectionGeneration = 0;

  const placeWhenReady = () => {
    if (!mapLoaded) return;
    placeCircles(map, markers);
  };

  function applyProjection() {
    if (!mapLoaded) return;
    map.setProjection({ type: pendingProjection });
    // 平面地図は世界を1枚に制限すると、日付変更線をまたぐ範囲の中心がアメリカ側へ寄ってしまう。
    map.setRenderWorldCopies(pendingProjection === "mercator");
  }

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
    requestAnimationFrame(() => {
      applyProjection();
      applyCircles();
    });
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
    followHotspot(hotspot, options) {
      if (!mapLoaded) return;
      follow.setTarget(hotspot, options);
    },
    setFollowEnabled(enabled) {
      follow.setEnabled(enabled);
    },
    onFollowInterrupted(callback) {
      notifyFollowInterrupted = callback;
    },
    setProjection(projection) {
      pendingProjection = projection;
      if (!mapLoaded) return;
      // 切り替え直後の fitBounds は、まだ地球儀のズームのまま計算されることがある。描画が落ち着いてから寄せ直す。
      const generation = ++projectionGeneration;
      map.once("idle", () => {
        if (generation !== projectionGeneration) return;
        hasFitted = false;
        applyCircles();
      });
      applyProjection();
    },
    destroy() {
      follow.destroy();
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
      // 消えかけの円がまた現れたら、外さずに戻す。
      cancelLeaving(existing);
      updateCircleMarker(existing, circle, radius);
      continue;
    }
    markerByKey.set(key, createCircleMarker(map, circle, radius));
  }

  for (const [key, item] of markerByKey) {
    if (nextKeys.has(key) || item.leavingTimer) continue;
    item.marker.getElement().classList.add(styles.leaving);
    item.leavingTimer = window.setTimeout(() => {
      item.marker.remove();
      markerByKey.delete(key);
    }, LEAVE_MS);
  }

  return sorted.map((circle) => markerByKey.get(`${circle.ip}:${circle.statusClass}`));
}

const FIT_PADDING_PX = 72;
const WORLD_PIXELS_AT_ZOOM_ZERO = 512;

function fitLngLats(map, lngLats) {
  map.resize();
  if (lngLats.length === 1) {
    map.jumpTo({ center: lngLats[0], zoom: 3 });
    return;
  }

  // 経度をそのまま包むと日付変更線をまたぐ2点がアフリカ側の長い弧になる。近い経度へ寄せて短い方を収める。
  // fitBounds は地球儀側のズーム計算になり、平面地図へ切り替えるとその範囲からはみ出す。
  const anchorLongitude = lngLats[0][0];
  let west = anchorLongitude;
  let east = anchorLongitude;
  let south = lngLats[0][1];
  let north = lngLats[0][1];
  for (const lngLat of lngLats) {
    const longitude = longitudeNear(lngLat[0], anchorLongitude);
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, lngLat[1]);
    north = Math.max(north, lngLat[1]);
  }

  const width = Math.max(map.getContainer().clientWidth - FIT_PADDING_PX * 2, 1);
  const height = Math.max(map.getContainer().clientHeight - FIT_PADDING_PX * 2, 1);
  const longitudeFraction = Math.max((east - west) / 360, 1 / 360);
  const latitudeFraction = Math.max(mercatorY(south) - mercatorY(north), 1 / 360);
  const zoomX = Math.log2(width / (WORLD_PIXELS_AT_ZOOM_ZERO * longitudeFraction));
  const zoomY = Math.log2(height / (WORLD_PIXELS_AT_ZOOM_ZERO * latitudeFraction));
  map.jumpTo({
    center: [wrapLongitude((west + east) / 2), (south + north) / 2],
    zoom: Math.min(4, zoomX, zoomY),
  });
}

function mercatorY(latitude) {
  const clamped = Math.max(-85, Math.min(85, latitude));
  const sine = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
}

function wrapLongitude(longitude) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function longitudeNear(longitude, anchorLongitude) {
  const delta = (((longitude - anchorLongitude + 180) % 360) + 360) % 360 - 180;
  return anchorLongitude + delta;
}

function cancelLeaving(item) {
  if (!item.leavingTimer) return;
  window.clearTimeout(item.leavingTimer);
  item.leavingTimer = 0;
  item.marker.getElement().classList.remove(styles.leaving);
}

function createCircleMarker(map, circle, radius) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = styles.circle;
  paintCircleElement(element, circle, radius);

  // 地球儀の裏側は MapLibre が毎フレーム opacityWhenCovered を当てる。自動回転の途中でも透けないよう 0 にする。
  const marker = new Marker({ element, anchor: "center", opacityWhenCovered: 0 })
    .setLngLat(circleLngLat(circle))
    .setPopup(
      new Popup({ className: "ip-popup-wrap", offset: radius, maxWidth: "260px" }).setHTML(popupHtml(circle)),
    )
    .addTo(map);

  return { marker, radius, origin: circleLngLat(circle), leavingTimer: 0 };
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
      closeHiddenPopup(map, item);
    }
    return;
  }

  const placed = [];
  for (const item of markers) {
    if (!isOnVisibleSurface(map, item.origin)) {
      item.marker.setLngLat(item.origin);
      closeHiddenPopup(map, item);
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
    closeHiddenPopup(map, item);
  }
}

// 円の表示・非表示は Marker の opacityWhenCovered に任せる。裏側へ回った円の吹き出しだけ閉じる。
function closeHiddenPopup(map, item) {
  const popup = item.marker.getPopup();
  if (popup?.isOpen() && !isOnVisibleSurface(map, item.marker.getLngLat())) popup.remove();
}

function isOnVisibleSurface(map, lngLat) {
  const screenPoint = map.project(lngLat);
  const surface = map.unproject(screenPoint);
  const [longitude, latitude] = lngLatPair(lngLat);
  // 地球儀の裏側は手前の地表に投影される。往復して元の座標へ戻る点だけ見えている。平面地図ではこの往復が成り立つ。
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

// 1つのIPが全体の大半を占めると、面積比例では他の円がすべて最小になる。対数で差を残す。
function circleRadius(count, largestCount) {
  if (largestCount <= 1) return MIN_CIRCLE_RADIUS;
  const scale = Math.log1p(count) / Math.log1p(largestCount);
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
