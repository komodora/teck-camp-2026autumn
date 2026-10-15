import { formatCount, formatPercent, formatTimeRange } from "../../lib/format.js";
import styles from "./Summary.module.css";

export function Summary({ analysis, fileNames }) {
  const clientErrorRate =
    analysis.parsedLineCount === 0 ? 0 : analysis.clientErrorCount / analysis.parsedLineCount;
  const skippedNote =
    analysis.skippedLineCount > 0 ? ` / 読み飛ばした行 ${formatCount(analysis.skippedLineCount)}` : "";

  return (
    <>
      <p className={styles.fileNote}>
        {fileNames.join("、")}
        {skippedNote}
      </p>
      <div className={styles.summary}>
        <SummaryCard label="読み込んだリクエスト" value={formatCount(analysis.parsedLineCount)} />
        <SummaryCard label="400系" value={formatCount(analysis.clientErrorCount)} emphasis />
        <SummaryCard label="400系の割合" value={formatPercent(clientErrorRate)} />
        <SummaryCard
          label="対象期間 (JST)"
          value={formatTimeRange(analysis.earliestTimestampMs, analysis.latestTimestampMs)}
          period
        />
      </div>
    </>
  );
}

function SummaryCard({ label, value, emphasis = false, period = false }) {
  const className = [styles.card, emphasis ? styles.emphasis : "", period ? styles.period : ""].filter(Boolean).join(" ");

  return (
    <article className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
