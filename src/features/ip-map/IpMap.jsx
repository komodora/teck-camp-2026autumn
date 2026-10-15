import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadIpv4LocationTable } from "../../../locateIpv4.js";
import { formatCount, formatMinuteRange } from "../../lib/format.js";
import { drawIpMap } from "./drawIpMap.js";
import styles from "./IpMap.module.css";
import { plotIpSummaries } from "./plotIpSummaries.js";
import "./popup.css";
import { TIME_SPAN_OPTIONS, buildTimeWindows, countIpRequestsByWindow, largestCircleCount } from "./timeWindows.js";

const UNLOCATED_PREVIEW_LIMIT = 12;
const PLAYBACK_STEP_MS = 800;
// リクエストの無い区間を同じ速度で送ると、空白の地球儀が長く続く。
const EMPTY_WINDOW_STEP_MS = 250;
const DEFAULT_SPAN_MINUTES = 5;

export function IpMap({ ipSummaries, ipRequests, earliestTimestampMs, latestTimestampMs }) {
  const [locationError, setLocationError] = useState("");
  const [locationTable, setLocationTable] = useState(null);
  const [spanMinutes, setSpanMinutes] = useState(DEFAULT_SPAN_MINUTES);
  const [windowIndex, setWindowIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const mapElementRef = useRef(null);
  const mapHandleRef = useRef(null);

  const timeWindows = useMemo(
    () => buildTimeWindows(earliestTimestampMs, latestTimestampMs, spanMinutes),
    [earliestTimestampMs, latestTimestampMs, spanMinutes],
  );
  const summariesByWindow = useMemo(
    () => countIpRequestsByWindow(ipRequests, timeWindows),
    [ipRequests, timeWindows],
  );
  const radiusBasisCount = useMemo(() => largestCircleCount(summariesByWindow), [summariesByWindow]);
  const safeIndex = Math.min(windowIndex, Math.max(timeWindows.length - 1, 0));
  const activeWindow = timeWindows[safeIndex] ?? null;
  const activeSummaries = summariesByWindow[safeIndex] ?? [];

  const locatedOverview = useMemo(() => {
    if (!locationTable) return null;
    return plotIpSummaries(ipSummaries, locationTable);
  }, [ipSummaries, locationTable]);

  const plottedWindow = useMemo(() => {
    if (!locationTable) return null;
    return plotIpSummaries(activeSummaries, locationTable);
  }, [activeSummaries, locationTable]);

  useEffect(() => {
    let cancelled = false;
    setLocationError("");
    setLocationTable(null);

    loadIpv4LocationTable()
      .then((table) => {
        if (!cancelled) setLocationTable(table);
      })
      .catch((error) => {
        if (cancelled) return;
        setLocationError(error instanceof Error ? error.message : "位置情報を読み込めませんでした。");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setWindowIndex(0);
    setIsPlaying(false);
  }, [ipRequests]);

  useEffect(() => {
    if (!isPlaying || timeWindows.length < 2) return undefined;
    if (safeIndex >= timeWindows.length - 1) {
      setIsPlaying(false);
      return undefined;
    }

    const stepMs = activeSummaries.length === 0 ? EMPTY_WINDOW_STEP_MS : PLAYBACK_STEP_MS;
    const timer = window.setTimeout(() => {
      setWindowIndex((current) => current + 1);
    }, stepMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, safeIndex, timeWindows.length, activeSummaries.length]);

  useEffect(() => {
    const handle = drawIpMap(mapElementRef.current);
    mapHandleRef.current = handle;
    return () => {
      handle.destroy();
      mapHandleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapHandleRef.current || locatedOverview === null) return;
    mapHandleRef.current.fitLocations(locatedOverview.circles);
  }, [locatedOverview]);

  useEffect(() => {
    if (!mapHandleRef.current || plottedWindow === null) return;
    mapHandleRef.current.setCircles(plottedWindow.circles, radiusBasisCount);
  }, [plottedWindow, radiusBasisCount]);

  const mapStatus =
    locationError !== ""
      ? locationError
      : locationTable === null || plottedWindow === null
        ? "位置情報を読み込んでいます…"
        : describeWindow(activeSummaries.length, plottedWindow.unlocated.length, timeWindows.length, earliestTimestampMs);

  const unlocated = plottedWindow?.unlocated ?? [];
  const preview = unlocated.slice(0, UNLOCATED_PREVIEW_LIMIT);
  const hiddenCount = unlocated.length - preview.length;
  const canPlay = timeWindows.length > 1;

  function chooseSpanMinutes(minutes) {
    setSpanMinutes(minutes);
    setWindowIndex(0);
    setIsPlaying(false);
  }

  function handleSpanChange(event) {
    chooseSpanMinutes(Number(event.target.value));
  }

  function playFromCurrentWindow() {
    if (!canPlay) return;
    if (safeIndex >= timeWindows.length - 1) {
      setWindowIndex(0);
    }
    setIsPlaying(true);
  }

  function handlePlaybackClick() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    playFromCurrentWindow();
  }

  function showWindowAt(index) {
    setIsPlaying(false);
    setWindowIndex(index);
  }

  function handleWindowInput(event) {
    showWindowAt(Number(event.target.value));
  }

  return (
    <section className={styles.panel} aria-labelledby="map-heading">
      <div className={styles.copy}>
        <h2 id="map-heading">IPの分布</h2>
        <p>
          200系と400系を返したクライアントIPを推定位置に置いています。時間の幅で区切った件数を、再生しながら表示します。件数が多いほど円が大きく、400系は赤、200系は緑の縁です。ドラッグで地球儀を回せます。拡大すると、同じ位置のIPを少しずらして表示します。
        </p>
      </div>
      <div className={styles.legend}>
        <span className={`${styles.legendItem} ${styles.clientError}`}>400系</span>
        <span className={`${styles.legendItem} ${styles.success}`}>200系</span>
      </div>
      <div className={styles.playback}>
        <label className={styles.spanField}>
          時間の幅
          <select value={spanMinutes} onChange={handleSpanChange}>
            {TIME_SPAN_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.playButton} onClick={handlePlaybackClick} disabled={!canPlay}>
          {isPlaying ? "停止" : "再生"}
        </button>
        <label className={styles.scrubber}>
          表示する時間
          <input
            type="range"
            min={0}
            max={Math.max(timeWindows.length - 1, 0)}
            step={1}
            value={timeWindows.length === 0 ? 0 : safeIndex}
            onChange={handleWindowInput}
            disabled={!canPlay}
            aria-valuetext={playbackLabel(activeWindow, safeIndex, timeWindows.length, earliestTimestampMs)}
          />
        </label>
        <p className={styles.windowLabel}>
          {playbackLabel(activeWindow, safeIndex, timeWindows.length, earliestTimestampMs)}
        </p>
      </div>
      <p className={styles.status}>{mapStatus}</p>
      <div ref={mapElementRef} className={styles.map} aria-label="クライアントIPの分布地球儀" />
      <ul className={styles.unlocated}>
        {preview.map((summary) => (
          <li key={summary.ip}>{unlocatedLabel(summary)}</li>
        ))}
        {hiddenCount > 0 && <li>ほか {formatCount(hiddenCount)}件</li>}
      </ul>
      <p className={styles.credit}>
        位置情報: <a href="https://db-ip.com/">DB-IP</a>
      </p>
    </section>
  );
}

function playbackLabel(timeWindow, index, windowCount, earliestTimestampMs) {
  if (earliestTimestampMs === null) return "時刻がないため、時間ごとの表示はできません。";
  if (!timeWindow || windowCount === 0) return "この時間幅では区切れません。幅を広げてください。";
  return `${formatMinuteRange(timeWindow.startMs, timeWindow.endMs)}（${index + 1} / ${windowCount}）`;
}

function describeWindow(ipCount, unlocatedCount, windowCount, earliestTimestampMs) {
  if (earliestTimestampMs === null) return "時刻がないため、時間ごとの表示はできません。";
  if (windowCount === 0) return "この時間幅では区切れません。幅を広げてください。";
  if (ipCount === 0) return "この時間帯に200系・400系のリクエストはありません。";
  const plottedCount = ipCount - unlocatedCount;
  if (unlocatedCount === 0) return `${formatCount(plottedCount)}件のIPを表示しています。`;
  return `${formatCount(plottedCount)}件のIPを表示しています。位置が分からないIPが${formatCount(unlocatedCount)}件あります。`;
}

function unlocatedLabel(summary) {
  return `${summary.ip}（400系 ${formatCount(summary.status4xxCount)} / 200系 ${formatCount(summary.status2xxCount)}）`;
}
