import { estimateTravelMs } from "./cameraFollow.js";

// 再生中のカメラの行き先を、時点ごとに先に決めておく。
// 円が出てから向かうと、着くころには円が消えている（円は1秒ほどで消え、移動には1.3〜2秒かかる）。
// 再生するデータは手元にあるので、円が出て大きくなり切るときにちょうど中心へ着くよう、移動の時間だけ先に動き出す。

// IpMap.module.css の circle-enter と同じ長さ。
const CIRCLE_GROW_MS = 300;
// 同じ地点に最低これだけ留まる（再生の時間で数える）。
const MIN_DWELL_MS = 3000;
// 注目がこれより短く終わる地点へは向かわない。一瞬の地点へ飛ぶと滞在で縛られ、続く地点に遅れて着く。
// サンプルでは、すべての地点へ向かうと再生1分に19回動いて8割が遅刻、2秒未満を飛ばすと8回で9割近くが間に合った。
const MIN_HOTSPOT_MS = 2000;

// hotspots は時点ごとの注目地点（trackHotspots の結果）、stepMsByWindow は時点ごとの再生の長さ。
export function planFollowTargets(hotspots, stepMsByWindow) {
  const startMs = [];
  let elapsedMs = 0;
  for (const stepMs of stepMsByWindow) {
    startMs.push(elapsedMs);
    elapsedMs += stepMs;
  }

  const departures = [];
  let current = null;
  let lastDepartureMs = -Infinity;
  hotspots.forEach((hotspot, index) => {
    if (!hotspot || hotspot === hotspots[index - 1]) return;
    // 最初の地点には、再生を始めた時点から向いておく。
    if (!current) {
      departures.push({ atMs: -Infinity, target: hotspot });
      current = hotspot;
      return;
    }
    const endMs = hotspotEndMs(hotspots, startMs, elapsedMs, index);
    if (endMs - startMs[index] < MIN_HOTSPOT_MS) return;
    const idealMs = startMs[index] + CIRCLE_GROW_MS - estimateTravelMs(current, hotspot);
    // 滞在中で間に合わなくても、その地点が注目されているうちは遅れて向かう。飛ばすと、注目が戻った地点を映せずに居残る。
    const departureMs = Math.max(idealMs, lastDepartureMs + MIN_DWELL_MS);
    if (departureMs >= endMs) return;
    departures.push({ atMs: departureMs, target: hotspot });
    current = hotspot;
    lastDepartureMs = departureMs;
  });

  // 出発する時刻を含む時点の頭で切り替える。次の時点まで待つと、最大でその長さぶん遅れる。
  const targets = [];
  let next = 0;
  let target = null;
  for (const [index, atMs] of startMs.entries()) {
    while (next < departures.length && departures[next].atMs < atMs + stepMsByWindow[index]) {
      target = departures[next].target;
      next += 1;
    }
    targets.push(target);
  }
  return targets;
}

// index から始まった注目地点が、次の地点へ切り替わる時刻。
function hotspotEndMs(hotspots, startMs, totalMs, index) {
  for (let later = index + 1; later < hotspots.length; later += 1) {
    if (hotspots[later] !== hotspots[index]) return startMs[later];
  }
  return totalMs;
}
