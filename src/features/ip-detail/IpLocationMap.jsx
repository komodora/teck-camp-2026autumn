import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadIpv4LocationTable } from "../../../locateIpv4.js";
import { drawIpMap } from "../ip-map/drawIpMap.js";
import { plotIpSummaries } from "../ip-map/plotIpSummaries.js";
import "../ip-map/popup.css";
import styles from "./IpDetail.module.css";

export function IpLocationMap({ ip, status4xxCount }) {
  const [locationError, setLocationError] = useState("");
  const [locationTable, setLocationTable] = useState(null);
  const mapElementRef = useRef(null);
  const mapHandleRef = useRef(null);

  const plotted = useMemo(() => {
    if (!locationTable) return null;
    return plotIpSummaries([{ ip, status2xxCount: 0, status4xxCount }], locationTable);
  }, [locationTable, ip, status4xxCount]);

  useEffect(() => {
    let cancelled = false;
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
    const handle = drawIpMap(mapElementRef.current);
    mapHandleRef.current = handle;
    return () => {
      handle.destroy();
      mapHandleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = mapHandleRef.current;
    if (!handle || plotted === null || plotted.circles.length === 0) return;
    handle.setCircles(plotted.circles, plotted.circles[0].count);
    handle.fitLocations(plotted.circles);
  }, [plotted]);

  const mapStatus =
    locationError !== ""
      ? locationError
      : plotted === null
        ? "位置情報を読み込んでいます…"
        : plotted.circles.length === 0
          ? "このIPの位置は特定できませんでした。"
          : "推定位置を表示しています。";

  return (
    <section className={styles.mapPanel} aria-labelledby="ip-map-heading">
      <h2 id="ip-map-heading">推定位置</h2>
      <p className={styles.mapStatus}>{mapStatus}</p>
      <div ref={mapElementRef} className={styles.map} aria-label={`${ip}の推定位置の地図`} />
      <p className={styles.credit}>
        位置情報: <a href="https://db-ip.com/">DB-IP</a>
      </p>
    </section>
  );
}
