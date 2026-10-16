// 再生バーの上に並べる、時間帯ごとの400系・200系の件数。

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// 1本の幅は集計の幅に合わせる。数日分のログで本数が多すぎると細くて読めないので広げる。
const BIN_MINUTE_OPTIONS = [5, 15, 30, 60, 180, 360, 1440];
const MAX_BINS = 300;
// 飛び抜けた棒に合わせると他が平らになる（サンプルの5分ごとの200系は最大6,229件、件数のある棒の上位10%が69件）。
// 件数のある棒の上位10%の値の4倍で頭打ちにし、超えた棒は印を付ける。
// 上位1%で切ると、1時間続いたスパイクの棒がそのまま上限になって効かなかった。
const CAP_PERCENTILE = 0.9;
const CAP_MULTIPLIER = 4;
const TICK_HOUR_OPTIONS = [1, 3, 6, 12, 24];
const MAX_TICKS = 8;
// 目盛りは JST の時刻ちょうどに置く。
const JST_OFFSET_MS = 9 * HOUR_MS;

export function buildTimelineBins(ipRequests, startMs, endMs, spanMinutes) {
  const binMinutes =
    BIN_MINUTE_OPTIONS.find((minutes) => minutes >= spanMinutes && binCount(startMs, endMs, minutes) <= MAX_BINS) ??
    BIN_MINUTE_OPTIONS.at(-1);
  const binMs = binMinutes * MINUTE_MS;
  const originMs = Math.floor(startMs / binMs) * binMs;
  const bins = Array.from({ length: binCount(startMs, endMs, binMinutes) }, (_, index) => ({
    startMs: originMs + index * binMs,
    endMs: originMs + (index + 1) * binMs,
    status2xxCount: 0,
    status4xxCount: 0,
  }));

  for (const request of ipRequests) {
    const bin = bins[Math.floor((request.timestampMs - originMs) / binMs)];
    if (!bin) continue;
    if (request.statusClass === "2xx") bin.status2xxCount += 1;
    if (request.statusClass === "4xx") bin.status4xxCount += 1;
  }

  return {
    binMinutes,
    bins,
    scale2xx: scaleOf(bins.map((bin) => bin.status2xxCount)),
    scale4xx: scaleOf(bins.map((bin) => bin.status4xxCount)),
  };
}

export function buildTimelineTicks(startMs, endMs) {
  const hours = TICK_HOUR_OPTIONS.find((option) => (endMs - startMs) / (option * HOUR_MS) <= MAX_TICKS) ?? 24;
  const stepMs = hours * HOUR_MS;
  const ticks = [];
  for (let tickMs = Math.ceil((startMs + JST_OFFSET_MS) / stepMs) * stepMs - JST_OFFSET_MS; tickMs <= endMs; tickMs += stepMs) {
    ticks.push(tickMs);
  }
  return ticks;
}

function binCount(startMs, endMs, minutes) {
  const binMs = minutes * MINUTE_MS;
  return Math.max(Math.ceil((endMs - Math.floor(startMs / binMs) * binMs) / binMs), 1);
}

// cap は棒の高さの上限（これで100%）、largest は実際の最大値。
function scaleOf(counts) {
  const nonZero = counts.filter((count) => count > 0).sort((left, right) => left - right);
  if (nonZero.length === 0) return { cap: 1, largest: 0 };
  const largest = nonZero.at(-1);
  return { cap: Math.min(largest, nonZero[Math.floor((nonZero.length - 1) * CAP_PERCENTILE)] * CAP_MULTIPLIER), largest };
}
