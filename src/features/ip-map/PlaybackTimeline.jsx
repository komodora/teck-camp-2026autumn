import { memo, useMemo, useRef, useState } from "react";
import { formatClock, formatCount, formatMinuteRange } from "../../lib/format.js";
import styles from "./IpMap.module.css";
import { buildTimelineBins, buildTimelineTicks } from "./timelineBins.js";

// 再生バーの上に、時間帯ごとの400系・200系の件数を上下2本の帯で並べる。
// 400系は200系より桁違いに少ないので、積み上げず帯ごとに自分の目盛りで描く。
// クリック・ドラッグでその時刻へ飛べる。キーボードでは下の再生バーを使う。
export function PlaybackTimeline({ ipRequests, timeWindows, activeIndex, spanMinutes, onSeek }) {
  const plotRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [hoverIndex, setHoverIndex] = useState(null);

  // 時点 i は timeWindows[i].endMs の時刻。最初の時点の刻みの頭から、最後の時点までを横幅に並べる。
  const startMs = timeWindows.length === 0 ? 0 : timeWindows[0].endMs - timeWindows[0].stepMs;
  const endMs = timeWindows.length === 0 ? 0 : timeWindows.at(-1).endMs;
  const timeline = useMemo(
    () => (timeWindows.length === 0 ? null : buildTimelineBins(ipRequests, startMs, endMs, spanMinutes)),
    [ipRequests, startMs, endMs, spanMinutes, timeWindows.length],
  );
  const ticks = useMemo(() => buildTimelineTicks(startMs, endMs), [startMs, endMs]);
  if (!timeline) return null;

  const position = (timestampMs) => clamp((timestampMs - startMs) / (endMs - startMs), 0, 1) * 100;
  const activeWindow = timeWindows[activeIndex];
  const hoverBin = hoverIndex === null ? null : timeline.bins[hoverIndex];

  function timeAt(event) {
    const rect = plotRef.current.getBoundingClientRect();
    return startMs + clamp((event.clientX - rect.left) / rect.width, 0, 1) * (endMs - startMs);
  }

  function seekTo(event) {
    const { endMs: firstEndMs, stepMs } = timeWindows[0];
    onSeek(clamp(Math.round((timeAt(event) - firstEndMs) / stepMs), 0, timeWindows.length - 1));
  }

  function handlePointerDown(event) {
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTo(event);
  }

  function handlePointerMove(event) {
    const binMs = timeline.binMinutes * 60 * 1000;
    const index = Math.floor((timeAt(event) - timeline.bins[0].startMs) / binMs);
    setHoverIndex(clamp(index, 0, timeline.bins.length - 1));
    if (isDraggingRef.current) seekTo(event);
  }

  function handlePointerUp() {
    isDraggingRef.current = false;
  }

  function handlePointerLeave() {
    setHoverIndex(null);
  }

  return (
    <div className={styles.timeline}>
      <p className={styles.timelineLegend}>
        <span className={`${styles.legendItem} ${styles.clientError}`}>上: 400系</span>
        {scaleLabel(timeline.scale4xx)}
        <span className={`${styles.legendItem} ${styles.success}`}>下: 200系</span>
        {scaleLabel(timeline.scale2xx)}
        <span>1本 = {binLabel(timeline.binMinutes)}</span>
      </p>
      <div
        ref={plotRef}
        className={styles.timelinePlot}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        aria-hidden="true"
      >
        <TimelineBars timeline={timeline} startMs={startMs} endMs={endMs} />
        {activeWindow && (
          <>
            <span
              className={styles.timelineWindow}
              style={{
                left: `${position(activeWindow.startMs)}%`,
                width: `${position(activeWindow.endMs) - position(activeWindow.startMs)}%`,
              }}
            />
            <span className={styles.timelinePlayhead} style={{ left: `${position(activeWindow.endMs)}%` }} />
          </>
        )}
        {hoverBin && (
          <span
            className={styles.timelineTooltip}
            style={{
              left: `${position((hoverBin.startMs + hoverBin.endMs) / 2)}%`,
              transform: `translateX(${tooltipShift(position((hoverBin.startMs + hoverBin.endMs) / 2))})`,
            }}
          >
            {formatMinuteRange(hoverBin.startMs, hoverBin.endMs)}
            <br />
            400系 {formatCount(hoverBin.status4xxCount)}件 / 200系 {formatCount(hoverBin.status2xxCount)}件
          </span>
        )}
      </div>
      <div className={styles.timelineTicks} aria-hidden="true">
        {ticks.map((tickMs) => (
          <span key={tickMs} style={{ left: `${position(tickMs)}%` }}>
            {formatClock(tickMs)}
          </span>
        ))}
      </div>
    </div>
  );
}

// 再生中は時点が200msごとに進む。棒は描き直さず、再生位置の線だけを動かす。
const TimelineBars = memo(function TimelineBars({ timeline, startMs, endMs }) {
  const span = endMs - startMs;
  return (
    <>
      {[
        { key: "4xx", field: "status4xxCount", scale: timeline.scale4xx, className: styles.clientError },
        { key: "2xx", field: "status2xxCount", scale: timeline.scale2xx, className: styles.success },
      ].map((strip) => (
        <div key={strip.key} className={`${styles.timelineStrip} ${strip.className}`}>
          {timeline.bins.map((bin) => {
            const count = bin[strip.field];
            if (count === 0) return null;
            const left = clamp((bin.startMs - startMs) / span, 0, 1) * 100;
            const right = clamp((bin.endMs - startMs) / span, 0, 1) * 100;
            return (
              <span
                key={bin.startMs}
                className={count > strip.scale.cap ? `${styles.timelineBar} ${styles.timelineClipped}` : styles.timelineBar}
                style={{
                  left: `${left}%`,
                  width: `${right - left}%`,
                  height: `${(Math.min(count, strip.scale.cap) / strip.scale.cap) * 100}%`,
                }}
              />
            );
          })}
        </div>
      ))}
    </>
  );
});

function scaleLabel(scale) {
  if (scale.largest === 0) return <span>なし</span>;
  if (scale.largest <= scale.cap) return <span>最大 {formatCount(scale.largest)}件</span>;
  return (
    <span>
      最大 {formatCount(scale.largest)}件（{formatCount(scale.cap)}件で頭打ち、超えた棒は上端が黒）
    </span>
  );
}

function binLabel(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440}日`;
  if (minutes % 60 === 0) return `${minutes / 60}時間`;
  return `${minutes}分`;
}

// 端の棒では吹き出しを内側へ寄せ、パネルからはみ出さないようにする。
function tooltipShift(percent) {
  if (percent < 15) return "0%";
  if (percent > 85) return "-100%";
  return "-50%";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
