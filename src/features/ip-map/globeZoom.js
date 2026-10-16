// 地球儀の大きさを、地図の枠に対する見た目の直径で決める。
// MapLibre の地球儀は同じズームでも中心の緯度で大きさが変わる（直径 = 512 × 2^zoom / (π × cos 緯度)）。
// さらにカメラが近いので、輪郭は遠近で直径より小さく見える（初期表示で狙いの8割弱だった）。両方を戻してズームを逆算する。

// 引いたとき: 地球全体が枠の短辺に収まる。
const OVERVIEW_DIAMETER_OF_SHORT_SIDE = 1;
// 寄ったとき: 枠の四隅まで地表で埋まる。
const FOCUS_DIAMETER_OF_DIAGONAL = 1.1;
const TILE_SIZE = 512;
const MAX_LATITUDE = 85;

export function overviewZoom(map, latitude) {
  const { width, height } = containerSize(map);
  return zoomForApparentDiameter(map, Math.min(width, height) * OVERVIEW_DIAMETER_OF_SHORT_SIDE, latitude);
}

export function focusZoom(map, latitude) {
  const { width, height } = containerSize(map);
  return zoomForApparentDiameter(map, Math.hypot(width, height) * FOCUS_DIAMETER_OF_DIAGONAL, latitude);
}

function zoomForApparentDiameter(map, apparentDiameterPx, latitude) {
  const radius = sphereRadiusForApparentRadius(map, Math.max(apparentDiameterPx, 1) / 2);
  const latitudeScale = Math.cos((Math.min(Math.abs(latitude), MAX_LATITUDE) * Math.PI) / 180);
  return Math.log2((2 * radius * Math.PI * latitudeScale) / TILE_SIZE);
}

// カメラは画面中央の地表から c の距離にある（MapLibre の cameraToCenterDistance と同じ式）。
// 半径 R の球の輪郭は、地表の位置で R·c / √(c² + 2cR) に見える。これを R について解く。
function sphereRadiusForApparentRadius(map, apparentRadius) {
  const halfFov = (map.getVerticalFieldOfView() * Math.PI) / 360;
  const cameraDistance = (0.5 / Math.tan(halfFov)) * containerSize(map).height;
  return (apparentRadius ** 2 + apparentRadius * Math.hypot(apparentRadius, cameraDistance)) / cameraDistance;
}

function containerSize(map) {
  const container = map.getContainer();
  return { width: container.clientWidth, height: container.clientHeight };
}
