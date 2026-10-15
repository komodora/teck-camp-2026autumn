import { formatCount, formatPercent } from "../../lib/format.js";
import styles from "./Ranking.module.css";
import { formatHostList, hostsByCount, statusChipEntries } from "./visibleRanking.js";

export function RankingTable({ rows, shareTotal, selectedStatusCode }) {
  const largestCount = rows[0]?.count ?? 0;

  return (
    <div className={styles.tableScroll}>
      <table>
        <caption className="visually-hidden">
          400系を返したリクエストの件数ランキング。パスはクエリ文字列を除いて集計しています。
        </caption>
        <thead>
          <tr>
            <th scope="col">順位</th>
            <th scope="col">メソッド</th>
            <th scope="col">パス</th>
            <th scope="col">ステータス</th>
            <th scope="col" className={styles.numeric}>
              件数
            </th>
            <th scope="col" className={styles.numeric}>
              割合
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <RankingRow
              key={`${row.method} ${row.path}`}
              row={row}
              rank={index + 1}
              shareTotal={shareTotal}
              largestCount={largestCount}
              selectedStatusCode={selectedStatusCode}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingRow({ row, rank, shareTotal, largestCount, selectedStatusCode }) {
  const share = shareTotal === 0 ? 0 : row.count / shareTotal;
  const barWidth = largestCount === 0 ? 0 : (row.count / largestCount) * 100;
  const hosts = hostsByCount(row.hosts);

  return (
    <tr>
      <td className={styles.rank}>{rank}</td>
      <td className={styles.method}>{row.method}</td>
      <td>
        <div className={styles.path}>{row.path}</div>
        {hosts.length > 0 && <div className={styles.host}>{formatHostList(hosts)}</div>}
      </td>
      <td>
        <StatusChips row={row} selectedStatusCode={selectedStatusCode} />
      </td>
      <td className={styles.count}>
        {formatCount(row.count)}
        <span className={styles.countBar}>
          <span style={{ width: `${barWidth}%` }} />
        </span>
      </td>
      <td className={styles.share}>{formatPercent(share)}</td>
    </tr>
  );
}

function StatusChips({ row, selectedStatusCode }) {
  return (
    <div className={styles.statusList}>
      {statusChipEntries(row, selectedStatusCode).map(([statusCode, count]) => (
        <span key={statusCode} className={styles.statusChip}>
          {chipLabel(row, statusCode, count)}
        </span>
      ))}
    </div>
  );
}

function chipLabel(row, statusCode, count) {
  if (row.statusCounts.size > 1) return `${statusCode} ${formatCount(count)}`;
  return String(statusCode);
}
