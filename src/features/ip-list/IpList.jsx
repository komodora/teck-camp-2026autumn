import { formatCount } from "../../lib/format.js";
import { ipDetailPagePath } from "../../pages.js";
import styles from "./IpList.module.css";

export function IpList({ analysis }) {
  const rows = analysis.ipSummaries.filter((summary) => summary.status4xxCount > 0);

  return (
    <section className={styles.panel} aria-labelledby="ip-list-heading">
      <h2 id="ip-list-heading">400系のクライアントIP</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>400系を返したクライアントIPはありません。</p>
      ) : (
        <div className={styles.tableScroll}>
          <table>
            <caption className="visually-hidden">400系を返したクライアントIPの一覧。400系の件数が多い順です。</caption>
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
      )}
    </section>
  );
}
