import { focusZoom, overviewZoom } from "./globeZoom.js";
import { angularDistanceDegrees } from "./hotspot.js";

// 同じ地点に最低これだけ留まる。サンプルでは3秒だと再生1分に18回動き、7割が大陸をまたいで目が回った。
const MIN_DWELL_MS = 6000;
// 大陸をまたぐ移動は、ばねで寄せると地球儀が勢いよく回りすぎる。一度引いてから寄せる。
const FLY_THRESHOLD_DEGREES = 60;
const FLY_DURATION_MS = 2000;
const FLY_CURVE = 1.6;
// 中心とズームは臨界減衰のばねで寄せる。動き出しも止まり際も速度が滑らかに変わり、1.3秒ほどで落ち着く。
// easeTo を区間ごとに呼ぶと「動いて止まる」を繰り返してかくついた。
const SPRING_RATE = 3.5;
const SETTLED_DEGREES = 0.01;
const SETTLED_DEGREES_PER_SECOND = 0.05;
const SETTLED_ZOOM = 0.002;
// タブが裏に回って間が空いても、1フレームで大きく飛ばない。
const MAX_FRAME_SECONDS = 0.05;
const MAX_LATITUDE = 80;
const IDLE_SPIN_DEGREES_PER_SECOND = 4;
// 追従は寄り引きもするので、ユーザーがズームしたときも止める。
const USER_MOVE_EVENTS = ["dragstart", "rotatestart", "pitchstart", "zoomstart"];
const AT_REST = { lng: 0, lat: 0, zoom: 0 };

export function createCameraFollow(map, { onInterrupted }) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let enabled = true;
  let target = null;
  let spinning = false;
  let velocity = AT_REST;
  let lastAimAt = -Infinity;
  let pendingTimer = 0;
  let frame = 0;
  let previousTime = 0;

  const interrupt = (event) => {
    if (!event.originalEvent || !enabled) return;
    enabled = false;
    stop();
    onInterrupted();
  };
  for (const type of USER_MOVE_EVENTS) map.on(type, interrupt);

  function stop() {
    window.clearTimeout(pendingTimer);
    pendingTimer = 0;
    window.cancelAnimationFrame(frame);
    frame = 0;
    spinning = false;
    velocity = AT_REST;
  }

  function run() {
    if (frame !== 0) return;
    previousTime = performance.now();
    frame = window.requestAnimationFrame(step);
  }

  function step(time) {
    frame = 0;
    const seconds = Math.min(Math.max(time - previousTime, 0) / 1000, MAX_FRAME_SECONDS);
    previousTime = time;

    // flyTo やホイールでのズームの途中は MapLibre に任せ、終わってから寄せ直す。
    if (map.isMoving()) {
      velocity = AT_REST;
      frame = window.requestAnimationFrame(step);
      return;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    const onGlobe = isGlobe(map);
    if (spinning) {
      // 自転中は引いて地球全体を見せる。自転の速度を残しておくと、次の地点へ向かうときに止まらずに曲がっていく。
      const zoomVelocity = onGlobe ? springVelocity(velocity.zoom, overviewZoom(map, center.lat) - zoom, seconds) : 0;
      velocity = { lng: IDLE_SPIN_DEGREES_PER_SECOND, lat: 0, zoom: zoomVelocity };
      map.jumpTo({
        center: [wrapLongitude(center.lng + velocity.lng * seconds), center.lat],
        zoom: zoom + zoomVelocity * seconds,
      });
      frame = window.requestAnimationFrame(step);
      return;
    }
    if (!target) return;

    // 注目地点を追っている間は寄って、枠いっぱいに見せる。平面地図ではズームに触らない。
    const offset = {
      lng: longitudeDelta(center.lng, target.lng),
      lat: target.lat - center.lat,
      zoom: onGlobe ? focusZoom(map, target.lat) - zoom : 0,
    };
    if (isSettled(offset, velocity)) {
      velocity = AT_REST;
      return;
    }
    velocity = {
      lng: springVelocity(velocity.lng, offset.lng, seconds),
      lat: springVelocity(velocity.lat, offset.lat, seconds),
      zoom: springVelocity(velocity.zoom, offset.zoom, seconds),
    };
    map.jumpTo({
      center: [
        wrapLongitude(center.lng + velocity.lng * seconds),
        clamp(center.lat + velocity.lat * seconds, -MAX_LATITUDE, MAX_LATITUDE),
      ],
      zoom: zoom + velocity.zoom * seconds,
    });
    frame = window.requestAnimationFrame(step);
  }

  function aim(nextTarget) {
    target = nextTarget;
    lastAimAt = performance.now();
    const center = [nextTarget.lng, nextTarget.lat];
    const zoom = isGlobe(map) ? focusZoom(map, nextTarget.lat) : map.getZoom();
    if (reducedMotion.matches) {
      map.jumpTo({ center, zoom });
      return;
    }
    if (angularDistanceDegrees(map.getCenter(), nextTarget) >= FLY_THRESHOLD_DEGREES) {
      velocity = AT_REST;
      map.flyTo({ center, zoom, duration: FLY_DURATION_MS, curve: FLY_CURVE, essential: true });
    }
    run();
  }

  return {
    // idle はリクエストの無い時点を再生しているとき。地点へは向かず、ゆっくり自転させる。
    setTarget(nextTarget, { idle, respectDwell }) {
      if (!enabled) return;
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;

      spinning = idle && !reducedMotion.matches && isGlobe(map);
      if (spinning) {
        run();
        return;
      }
      if (!nextTarget) return;
      // 同じ地点のままなら、自転でずれた分だけ戻す。
      if (nextTarget === target) {
        run();
        return;
      }

      const waitMs = respectDwell ? lastAimAt + MIN_DWELL_MS - performance.now() : 0;
      if (waitMs <= 0) {
        aim(nextTarget);
        return;
      }
      pendingTimer = window.setTimeout(() => {
        pendingTimer = 0;
        aim(nextTarget);
      }, waitMs);
      run();
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) stop();
    },
    destroy() {
      stop();
      for (const type of USER_MOVE_EVENTS) map.off(type, interrupt);
    },
  };
}

function springVelocity(velocity, offset, seconds) {
  return velocity + (SPRING_RATE ** 2 * offset - 2 * SPRING_RATE * velocity) * seconds;
}

function isSettled(offset, velocity) {
  return (
    Math.abs(offset.lng) < SETTLED_DEGREES &&
    Math.abs(offset.lat) < SETTLED_DEGREES &&
    Math.abs(offset.zoom) < SETTLED_ZOOM &&
    Math.hypot(velocity.lng, velocity.lat) < SETTLED_DEGREES_PER_SECOND &&
    Math.abs(velocity.zoom) < SETTLED_ZOOM
  );
}

function isGlobe(map) {
  return map.getProjection()?.type === "globe";
}

function longitudeDelta(from, to) {
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}

function wrapLongitude(longitude) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
