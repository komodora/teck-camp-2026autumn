import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadIpv4LocationTable } from "../../../locateIpv4.js";
import { formatCount } from "../../lib/format.js";
import { drawIpMap } from "./drawIpMap.js";
import styles from "./IpMap.module.css";
import { plotIpSummaries } from "./plotIpSummaries.js";
import "./popup.css";

const UNLOCATED_PREVIEW_LIMIT = 12;

export function IpMap({ ipSummaries }) {
  const [mapStatus, setMapStatus] = useState("位置情報を読み込んでいます…");
  const [unlocated, setUnlocated] = useState([]);
  const [circles, setCircles] = useState(null);
  const mapElementRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setMapStatus("位置情報を読み込んでいます…");
    setUnlocated([]);
    setCircles(null);

    loadIpv4LocationTable()
      .then((locationTable) => {
        if (cancelled) return;
        const plotted = plotIpSummaries(ipSummaries, locationTable);
        setCircles(plotted.circles);
        setUnlocated(plotted.unlocated);
        setMapStatus(describePlottedIps(ipSummaries.length, plotted.unlocated.length));
      })
      .catch((error) => {
        if (cancelled) return;
        setMapStatus(error instanceof Error ? error.message : "位置情報を読み込めませんでした。");
      });

    return () => {
      cancelled = true;
    };
  }, [ipSummaries]);

  useEffect(() => {
    if (circles === null || mapElementRef.current === null) return undefined;
    return drawIpMap(mapElementRef.current, circles);
  }, [circles]);

  const preview = unlocated.slice(0, UNLOCATED_PREVIEW_LIMIT);
  const hiddenCount = unlocated.length - preview.length;

  return (
    <section className={styles.panel} aria-labelledby="map-heading">
      <div className={styles.copy}>
        <h2 id="map-heading">IPの分布</h2>
        <p>
          200系と400系を返したクライアントIPを推定位置に置いています。件数が多いほど円が大きく、400系は赤、200系は緑の縁です。ドラッグで地球儀を回せます。拡大すると、同じ位置のIPを少しずらして表示します。
        </p>
      </div>
      <div className={styles.legend}>
        <span className={`${styles.legendItem} ${styles.clientError}`}>400系</span>
        <span className={`${styles.legendItem} ${styles.success}`}>200系</span>
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

function describePlottedIps(ipCount, unlocatedCount) {
  if (ipCount === 0) return "200系・400系のリクエストはありません。";
  const plottedCount = ipCount - unlocatedCount;
  if (unlocatedCount === 0) return `${formatCount(plottedCount)}件のIPを表示しています。`;
  return `${formatCount(plottedCount)}件のIPを表示しています。位置が分からないIPが${formatCount(unlocatedCount)}件あります。`;
}

function unlocatedLabel(summary) {
  return `${summary.ip}（400系 ${formatCount(summary.status4xxCount)} / 200系 ${formatCount(summary.status2xxCount)}）`;
}
