import { useState } from "react";
import { analyzeAccessLogRecords } from "../../../analyzeAlbAccessLog.js";
import { DATA_SOURCES, getDataSource, getExternalDate, setDataSource, setExternalDate } from "../../lib/dataSource.js";
import { Chat } from "../chat";
import { IpList } from "../ip-list";
import { IpMap } from "../ip-map";
import { Ranking } from "../ranking";
import { Summary } from "../summary";
import styles from "./Report.module.css";
import { searchStoredAccessLogs } from "./searchStoredAccessLogs.js";

export function Report() {
  const [dataSource, setDataSourceState] = useState(getDataSource());
  const [externalDate, setExternalDateState] = useState(getExternalDate());
  const [analysis, setAnalysis] = useState(null);
  const [fetchError, setFetchError] = useState("");
  const [isFetching, setIsFetching] = useState(false);

  async function showStoredAccessLogs() {
    setFetchError("");
    setIsFetching(true);
    try {
      const records = await searchStoredAccessLogs();
      const nextAnalysis = analyzeAccessLogRecords(records);
      if (nextAnalysis.parsedLineCount === 0) {
        setAnalysis(null);
        setFetchError("表示できるアクセスログがありません。");
        return;
      }
      setAnalysis(nextAnalysis);
    } catch (error) {
      setAnalysis(null);
      setFetchError(error instanceof Error ? error.message : "保存済みログを取得できませんでした。");
    } finally {
      setIsFetching(false);
    }
  }

  function handleFetchClick() {
    showStoredAccessLogs();
  }

  function handleDataSourceChange(event) {
    const value = event.target.value;
    setDataSource(value);
    setDataSourceState(value);
    setAnalysis(null);
  }

  function handleExternalDateChange(event) {
    const value = event.target.value;
    setExternalDate(value);
    setExternalDateState(value);
    setAnalysis(null);
  }

  return (
    <>
      <section className={styles.fetch} aria-labelledby="fetch-heading">
        <h2 id="fetch-heading" className="visually-hidden">
          保存済みログの取得
        </h2>
        <label className={styles.dataSourceField}>
          取得元
          <select value={dataSource} onChange={handleDataSourceChange}>
            {DATA_SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        {dataSource === "external" && (
          <label className={styles.dataSourceField}>
            日付(UTC、未指定で全期間)
            <input type="date" value={externalDate} onChange={handleExternalDateChange} />
          </label>
        )}
        <button type="button" className={styles.fetchButton} onClick={handleFetchClick} disabled={isFetching}>
          {isFetching ? "取得しています" : "データを取得"}
        </button>
        {fetchError !== "" && (
          <p className={styles.fetchError} role="alert">
            {fetchError}
          </p>
        )}
      </section>
      {analysis && (
        <section className={styles.results}>
          <Summary analysis={analysis} sourceLabel="保存済みのアクセスログ" />
          <IpMap
            ipSummaries={analysis.ipSummaries}
            ipRequests={analysis.ipRequests}
            earliestTimestampMs={analysis.earliestTimestampMs}
            latestTimestampMs={analysis.latestTimestampMs}
          />
          <IpList analysis={analysis} />
          <Ranking analysis={analysis} />
          <Chat />
        </section>
      )}
    </>
  );
}
