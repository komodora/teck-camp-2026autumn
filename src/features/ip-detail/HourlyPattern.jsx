import { formatCount } from "../../lib/format.js";
import { buildHourlyPattern } from "./hourlyPattern.js";
import styles from "./IpDetail.module.css";

export function HourlyPattern({ clientErrorTimestampsMs }) {
  const hours = buildHourlyPattern(clientErrorTimestampsMs);
  const largestCount = Math.max(1, ...hours.map((item) => item.count));

  return (
    <section className={styles.hourlyPanel} aria-labelledby="hourly-heading">
      <h2 id="hourly-heading">時刻帯のパターン (JST)</h2>
      <p className={styles.hourlyNote}>0〜23時台ごとの400系の件数です。</p>
      <ul className={styles.hourlyChart}>
        {hours.map((item) => (
          <li key={item.hour}>
            <span className="visually-hidden">
              {item.hour}時台 {formatCount(item.count)}件
            </span>
            <span className={styles.hourlyBar} aria-hidden="true">
              <span style={{ height: `${(item.count / largestCount) * 100}%` }} />
            </span>
            <span className={styles.hourlyLabel} aria-hidden="true">
              {item.hour}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
