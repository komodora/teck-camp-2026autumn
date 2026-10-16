import { useEffect, useState } from "react";
import { buildIpDetail } from "../../../analyzeAlbAccessLog.js";
import { formatCount, formatTimeRange } from "../../lib/format.js";
import { reportPagePath } from "../../pages.js";
import { Ranking } from "../ranking";
import { searchStoredAccessLogs } from "../report/searchStoredAccessLogs.js";
import { HourlyPattern } from "./HourlyPattern.jsx";
import styles from "./IpDetail.module.css";
import { IpLocationMap } from "./IpLocationMap.jsx";

export function IpDetail({ ip }) {
  const [detail, setDetail] = useState(null);
  const [fetchError, setFetchError] = useState("");
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (ip === "") return undefined;

    let cancelled = false;
    setFetchError("");
    setDetail(null);
    setIsFetching(true);

    searchStoredAccessLogs()
      .then((records) => {
        if (cancelled) return;
        setDetail(buildIpDetail(records, ip));
      })
      .catch((error) => {
        if (cancelled) return;
        setFetchError(error instanceof Error ? error.message : "保存済みログを取得できませんでした。");
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ip]);

  return (
    <>
      <p className={styles.back}>
        <a href={reportPagePath}>← ランキングへ戻る</a>
      </p>
      {ip === "" && <p className={styles.empty}>IPが指定されていません。</p>}
      {ip !== "" && isFetching && <p className={styles.status}>取得しています…</p>}
      {fetchError !== "" && (
        <p className={styles.fetchError} role="alert">
          {fetchError}
        </p>
      )}
      {detail && detail.status4xxCount === 0 && (
        <p className={styles.empty}>このIPの400系リクエストは見つかりませんでした。</p>
      )}
      {detail && detail.status4xxCount > 0 && (
        <section className={styles.results}>
          <header className={styles.header}>
            <h2 className={styles.ip}>{ip}</h2>
            <div className={styles.summary}>
              <SummaryCard label="400系" value={formatCount(detail.status4xxCount)} emphasis />
              <SummaryCard label="200系" value={formatCount(detail.status2xxCount)} />
              <SummaryCard
                label="400系の対象期間 (JST)"
                value={formatTimeRange(detail.earliestTimestampMs, detail.latestTimestampMs)}
                period
              />
            </div>
          </header>
          <Ranking analysis={detail} />
          <HourlyPattern clientErrorTimestampsMs={detail.clientErrorTimestampsMs} />
          <IpLocationMap ip={ip} status4xxCount={detail.status4xxCount} />
        </section>
      )}
    </>
  );
}

function SummaryCard({ label, value, emphasis = false, period = false }) {
  const className = [styles.card, emphasis ? styles.emphasis : "", period ? styles.period : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
