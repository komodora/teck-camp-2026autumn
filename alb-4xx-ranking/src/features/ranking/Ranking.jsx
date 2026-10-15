import { useEffect, useState } from "react";
import { formatCount } from "../../lib/format.js";
import styles from "./Ranking.module.css";
import { RankingTable } from "./RankingTable.jsx";
import { StatusFilters } from "./StatusFilters.jsx";
import { rankingShareTotal, visibleRankingRows } from "./visibleRanking.js";

export function Ranking({ analysis }) {
  const [selectedStatusCode, setSelectedStatusCode] = useState(null);
  const [pathQuery, setPathQuery] = useState("");

  useEffect(() => {
    setSelectedStatusCode(null);
    setPathQuery("");
  }, [analysis]);

  const normalizedPathQuery = pathQuery.trim().toLowerCase();
  const rows = visibleRankingRows(analysis.ranking, selectedStatusCode, normalizedPathQuery);
  const shareTotal = rankingShareTotal(rows, analysis, selectedStatusCode, normalizedPathQuery);

  function selectStatus(statusCode) {
    setSelectedStatusCode(statusCode);
  }

  function handlePathQueryChange(event) {
    setPathQuery(event.target.value);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <StatusFilters
          clientErrorCount={analysis.clientErrorCount}
          statusCounts={analysis.statusCounts}
          selectedStatusCode={selectedStatusCode}
          onSelectStatus={selectStatus}
        />
        <label className={styles.pathSearch}>
          パスを検索
          <input
            type="search"
            placeholder="例: /robots.txt"
            autoComplete="off"
            value={pathQuery}
            onChange={handlePathQueryChange}
          />
        </label>
      </div>
      <p className={styles.meta}>{rankingMetaText(analysis, selectedStatusCode, rows.length)}</p>
      {rows.length === 0 ? (
        <p className={styles.empty}>{emptyRankingMessage(analysis.clientErrorCount)}</p>
      ) : (
        <RankingTable rows={rows} shareTotal={shareTotal} selectedStatusCode={selectedStatusCode} />
      )}
    </div>
  );
}

function rankingMetaText(analysis, selectedStatusCode, visibleCount) {
  if (selectedStatusCode === null) {
    return `クエリ文字列を除いたパスで ${formatCount(analysis.ranking.length)} 種類。表示 ${formatCount(visibleCount)} 件。`;
  }
  return `${selectedStatusCode} に絞り込み中。表示 ${formatCount(visibleCount)} 件。`;
}

function emptyRankingMessage(clientErrorCount) {
  if (clientErrorCount === 0) return "400系のレスポンスはありません。";
  return "条件に一致するリクエストはありません。";
}
