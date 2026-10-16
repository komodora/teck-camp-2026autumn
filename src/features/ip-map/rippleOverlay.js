import styles from "./IpMap.module.css";

// 新しくリクエストが来た地点から、円の縁を波紋のように広げる。
// 地図の canvas と円（Marker）の間に canvas を1枚重ねて描く。地図が動いても毎フレーム投影し直すので位置がずれない。

const RIPPLE_MS = 1200;
// 400系は2重にする。2つ目のリングはこれだけ遅れて出る。
const SECOND_RING_DELAY_MS = 250;
const MIN_SPREAD_PX = 16;
const MAX_SPREAD_PX = 56;
// 1分に数百の IP が来ても重くならないよう、描く数を抑える。
const MAX_RIPPLES = 300;
// 毎分リクエストが来る地点は時点ごと（200ms）に波紋が出て、6〜7本重なってうるさかった。同じ円からはこの間隔を空ける。
const MIN_INTERVAL_MS = 600;

export function createRippleOverlay(map, { isVisible }) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  canvas.className = styles.ripples;
  // Marker も同じ入れ物に入るので、地図の canvas の直後に置けば円の下に描ける。
  map.getCanvas().after(canvas);
  const context = canvas.getContext("2d");
  let ripples = [];
  let frame = 0;
  const lastEmittedAt = new Map();

  function draw(time) {
    frame = 0;
    resizeToContainer(map, canvas, context);
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    context.clearRect(0, 0, width, height);

    ripples = ripples.filter((ripple) => time - ripple.startedAt < rippleDurationMs(ripple));
    for (const ripple of ripples) {
      if (!isVisible(ripple.lngLat)) continue;
      const point = map.project(ripple.lngLat);
      for (let ring = 0; ring < ripple.rings; ring += 1) {
        const progress = (time - ripple.startedAt - ring * SECOND_RING_DELAY_MS) / RIPPLE_MS;
        if (progress < 0 || progress >= 1) continue;
        const spread = 1 - (1 - progress) ** 3;
        context.beginPath();
        context.arc(point.x, point.y, ripple.baseRadius + ripple.spreadPx * spread, 0, Math.PI * 2);
        context.strokeStyle = ripple.color;
        context.globalAlpha = 0.85 * (1 - progress) ** 1.5;
        context.lineWidth = 3 - 2 * progress;
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    if (ripples.length > 0) frame = window.requestAnimationFrame(draw);
  }

  return {
    // items: { key, lngLat, color, baseRadius, strength（0〜1）, rings }
    emit(items) {
      if (reducedMotion.matches || items.length === 0) return;
      const startedAt = performance.now();
      for (const item of items) {
        if (startedAt - (lastEmittedAt.get(item.key) ?? -Infinity) < MIN_INTERVAL_MS) continue;
        lastEmittedAt.set(item.key, startedAt);
        ripples.push({
          lngLat: item.lngLat,
          color: item.color,
          baseRadius: item.baseRadius,
          spreadPx: MIN_SPREAD_PX + (MAX_SPREAD_PX - MIN_SPREAD_PX) * item.strength,
          rings: item.rings,
          startedAt,
        });
      }
      if (ripples.length > MAX_RIPPLES) ripples = ripples.slice(-MAX_RIPPLES);
      if (frame === 0) frame = window.requestAnimationFrame(draw);
    },
    destroy() {
      window.cancelAnimationFrame(frame);
      canvas.remove();
    },
  };
}

function rippleDurationMs(ripple) {
  return RIPPLE_MS + (ripple.rings - 1) * SECOND_RING_DELAY_MS;
}

// 高解像度の画面でもにじまないよう、表示の大きさに devicePixelRatio を掛けた解像度で描く。
function resizeToContainer(map, canvas, context) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
