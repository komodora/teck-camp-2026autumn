import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { countryName, loadIpv4LocationTable } from "../../../locateIpv4.js";
import { formatCount, formatMinuteRange } from "../../lib/format.js";
import { drawIpMap } from "./drawIpMap.js";
import { trackHotspots } from "./hotspot.js";
import styles from "./IpMap.module.css";
import { plotIpSummaries } from "./plotIpSummaries.js";
import "./popup.css";
import { TIME_SPAN_OPTIONS, buildTimeWindows, countIpRequestsByWindow, largestCircleCount } from "./timeWindows.js";

const UNLOCATED_PREVIEW_LIMIT = 12;
const PLAYBACK_STEP_MS = 800;
// リクエストの無い区間を同じ速度で送ると、空白の地球儀が長く続く。
const EMPTY_WINDOW_STEP_MS = 250;
const DEFAULT_SPAN_MINUTES = 5;
const GLOBE_PROJECTION = "globe";
const FLAT_PROJECTION = "mercator";
const EMPTY_PLOT = { circles: [], unlocated: [] };

export function IpMap({ ipSummaries, ipRequests, earliestTimestampMs, latestTimestampMs }) {
  const [locationError, setLocationError] = useState("");
  const [locationTable, setLocationTable] = useState(null);
  const [spanMinutes, setSpanMinutes] = useState(DEFAULT_SPAN_MINUTES);
  const [windowIndex, setWindowIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [projection, setProjection] = useState(GLOBE_PROJECTION);
  const [followEnabled, setFollowEnabled] = useState(true);
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

  // 注目地点は直前の区間にも左右されるので、区間ごとの円をまとめて置いておく。
  const plottedWindows = useMemo(() => {
    if (!locationTable) return null;
    return summariesByWindow.map((summaries) => plotIpSummaries(summaries, locationTable));
  }, [summariesByWindow, locationTable]);
  const plottedWindow = plottedWindows === null ? null : (plottedWindows[safeIndex] ?? EMPTY_PLOT);

  const hotspots = useMemo(() => {
    if (plottedWindows === null) return [];
    return trackHotspots(plottedWindows.map((plotted) => plotted.circles));
  }, [plottedWindows]);
  const hotspot = hotspots[safeIndex] ?? null;

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
    handle.onFollowInterrupted(() => setFollowEnabled(false));
    mapHandleRef.current = handle;
    return () => {
      handle.destroy();
      mapHandleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = mapHandleRef.current;
    if (!handle) return;
    handle.setProjection(projection);
    // 地球儀と平面地図では同じズームでも見える範囲が違う。切り替えたらIPが収まる位置へ戻す。
    if (locatedOverview) handle.fitLocations(locatedOverview.circles);
  }, [projection, locatedOverview]);

  useEffect(() => {
    if (!mapHandleRef.current || plottedWindow === null) return;
    mapHandleRef.current.setCircles(plottedWindow.circles, radiusBasisCount);
  }, [plottedWindow, radiusBasisCount]);

  const isEmptyWindow = activeSummaries.length === 0;
  useEffect(() => {
    const handle = mapHandleRef.current;
    if (!handle) return;
    handle.setFollowEnabled(followEnabled);
    if (!followEnabled) return;
    // 再生中は同じ地点に留まる時間を守る。スクラブで選んだ区間には、すぐ向ける。
    handle.followHotspot(hotspot, {
      idle: isPlaying && isEmptyWindow,
      durationMs: PLAYBACK_STEP_MS,
      respectDwell: isPlaying,
    });
  }, [followEnabled, hotspot, isPlaying, isEmptyWindow]);

  const mapStatus =
    locationError !== ""
      ? locationError
      : locationTable === null || plottedWindow === null
        ? "位置情報を読み込んでいます…"
        : [
            describeWindow(activeSummaries.length, plottedWindow.unlocated.length, timeWindows.length, earliestTimestampMs),
            describeHotspot(hotspot, isEmptyWindow),
          ]
            .filter((sentence) => sentence !== "")
            .join("");

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

  function showGlobe() {
    setProjection(GLOBE_PROJECTION);
  }

  function showFlatMap() {
    setProjection(FLAT_PROJECTION);
  }

  function handleGlobeClick() {
    showGlobe();
  }

  function handleFlatMapClick() {
    showFlatMap();
  }

  function handleFollowClick() {
    setFollowEnabled((current) => !current);
  }

  return (
    <section className={styles.panel} aria-labelledby="map-heading">
      <div className={styles.copy}>
        <h2 id="map-heading">IPの分布</h2>
        <p>
          200系と400系を返したクライアントIPを推定位置に置いています。時間の幅で区切った件数を、再生しながら表示します。件数が多いほど円が大きく、400系は赤、200系は緑の縁です。自動追従を入れると、件数の多い地点（400系を重く数えます）へ地球儀が向きます。ドラッグで回すと追従は止まります。拡大すると、同じ位置のIPを少しずらして表示します。
        </p>
      </div>
      <div className={styles.legendRow}>
        <div className={styles.legend}>
          <span className={`${styles.legendItem} ${styles.clientError}`}>400系</span>
          <span className={`${styles.legendItem} ${styles.success}`}>200系</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.viewToggle} role="group" aria-label="地図の表示">
            <button type="button" aria-pressed={projection === GLOBE_PROJECTION} onClick={handleGlobeClick}>
              地球儀
            </button>
            <button type="button" aria-pressed={projection === FLAT_PROJECTION} onClick={handleFlatMapClick}>
              平面地図
            </button>
          </div>
          <div className={styles.viewToggle}>
            <button type="button" aria-pressed={followEnabled} onClick={handleFollowClick}>
              自動追従
            </button>
          </div>
        </div>
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
      <div
        ref={mapElementRef}
        className={styles.map}
        aria-label={projection === GLOBE_PROJECTION ? "クライアントIPの分布地球儀" : "クライアントIPの分布地図"}
      />
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

function describeHotspot(hotspot, isEmptyWindow) {
  if (!hotspot || isEmptyWindow) return "";
  const country = countryName(hotspot.countryCode);
  if (country === "") return "";
  return `注目している地点は${country}付近です。`;
}

function unlocatedLabel(summary) {
  return `${summary.ip}（400系 ${formatCount(summary.status4xxCount)} / 200系 ${formatCount(summary.status2xxCount)}）`;
}
