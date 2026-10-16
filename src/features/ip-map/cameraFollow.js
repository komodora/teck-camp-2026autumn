import { angularDistanceDegrees } from "./hotspot.js";

// 同じ地点に最低これだけ留まる。サンプルの5分幅では3割近くの区間で東京と欧米を行き来し、目が回った。
const MIN_DWELL_MS = 3000;
const EASE_MAX_MS = 1200;
// 大陸をまたぐ移動は一度引いてから寄せる。
const FLY_THRESHOLD_DEGREES = 60;
const FLY_DURATION_MS = 2000;
const FLY_CURVE = 1.6;
// 小さなずれで地球儀を揺らさない。
const MIN_SHIFT_DEGREES = 8;
const IDLE_SPIN_DEGREES_PER_SECOND = 4;
const USER_MOVE_EVENTS = ["dragstart", "rotatestart", "pitchstart"];

export function createCameraFollow(map, { onInterrupted }) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let enabled = true;
  let lastMoveAt = -Infinity;
  let pendingTimer = 0;
  let spinFrame = 0;

  // ズームは追従の邪魔をしないので止めない。地球儀を回す操作だけ、ユーザーの向きを優先する。
  const interrupt = (event) => {
    if (!event.originalEvent || !enabled) return;
    enabled = false;
    cancel();
    onInterrupted();
  };
  for (const type of USER_MOVE_EVENTS) map.on(type, interrupt);

  function cancel() {
    window.clearTimeout(pendingTimer);
    pendingTimer = 0;
    window.cancelAnimationFrame(spinFrame);
    spinFrame = 0;
  }

  function moveTo(target, durationMs) {
    lastMoveAt = performance.now();
    const center = [target.lng, target.lat];
    if (reducedMotion.matches) {
      map.jumpTo({ center });
      return;
    }
    if (angularDistanceDegrees(map.getCenter(), target) >= FLY_THRESHOLD_DEGREES) {
      map.flyTo({ center, duration: FLY_DURATION_MS, curve: FLY_CURVE, essential: true });
      return;
    }
    map.easeTo({ center, duration: Math.min(durationMs, EASE_MAX_MS), easing: easeInOutCubic, essential: true });
  }

  function startSpin() {
    if (spinFrame !== 0 || reducedMotion.matches || map.getProjection()?.type !== "globe") return;
    let previousTime = performance.now();
    const spin = (time) => {
      const elapsedMs = time - previousTime;
      previousTime = time;
      if (!map.isMoving()) {
        const center = map.getCenter();
        map.setCenter([wrapLongitude(center.lng + (IDLE_SPIN_DEGREES_PER_SECOND * elapsedMs) / 1000), center.lat]);
      }
      spinFrame = window.requestAnimationFrame(spin);
    };
    spinFrame = window.requestAnimationFrame(spin);
  }

  return {
    // idle はリクエストの無い区間を再生しているとき。地点へは向かず、ゆっくり自転させる。
    setTarget(target, { idle, durationMs, respectDwell }) {
      cancel();
      if (!enabled) return;
      if (idle) {
        startSpin();
        return;
      }
      if (!target || angularDistanceDegrees(map.getCenter(), target) <= MIN_SHIFT_DEGREES) return;

      const waitMs = respectDwell ? lastMoveAt + MIN_DWELL_MS - performance.now() : 0;
      if (waitMs <= 0) {
        moveTo(target, durationMs);
        return;
      }
      pendingTimer = window.setTimeout(() => {
        pendingTimer = 0;
        moveTo(target, durationMs);
      }, waitMs);
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) cancel();
    },
    destroy() {
      cancel();
      for (const type of USER_MOVE_EVENTS) map.off(type, interrupt);
    },
  };
}

function easeInOutCubic(progress) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

function wrapLongitude(longitude) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}
