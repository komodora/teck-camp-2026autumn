import { formatCount } from "../../lib/format.js";
import { ipDetailPagePath } from "../../pages.js";
import styles from "./IpList.module.css";

const COLLAPSE_THRESHOLD = 10;

function IpTable({ rows, caption }) {
  return (
    <div className={styles.tableScroll}>
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">IP</th>
            <th scope="col" className={styles.numeric}>
              400系
            </th>
            <th scope="col" className={styles.numeric}>
              200系
            </th>
            <th scope="col">
              <span className="visually-hidden">詳細</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((summary) => (
            <tr key={summary.ip}>
              <td className={styles.ip}>{summary.ip}</td>
              <td className={styles.numeric}>{formatCount(summary.status4xxCount)}</td>
              <td className={styles.numeric}>{formatCount(summary.status2xxCount)}</td>
              <td className={styles.detail}>
                <a href={ipDetailPagePath(summary.ip)}>詳細を見る</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IpList({ analysis }) {
  const rows = analysis.ipSummaries.filter((summary) => summary.status4xxCount > 0);
  const mainRows = rows.filter((summary) => summary.status4xxCount > COLLAPSE_THRESHOLD);
  const collapsedRows = rows.filter((summary) => summary.status4xxCount <= COLLAPSE_THRESHOLD);

  return (
    <section className={styles.panel} aria-labelledby="ip-list-heading">
      <h2 id="ip-list-heading">400系のクライアントIP</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>400系を返したクライアントIPはありません。</p>
      ) : (
        <>
          {mainRows.length > 0 && (
            <IpTable rows={mainRows} caption="400系を返したクライアントIPの一覧。400系の件数が多い順です。" />
          )}
          {collapsedRows.length > 0 && (
            <details className={styles.collapsed}>
              <summary>400系が{COLLAPSE_THRESHOLD}件以下のIP({collapsedRows.length}件)</summary>
              <IpTable rows={collapsedRows} caption="400系が10件以下のクライアントIPの一覧。" />
            </details>
          )}
        </>
      )}
    </section>
  );
}
