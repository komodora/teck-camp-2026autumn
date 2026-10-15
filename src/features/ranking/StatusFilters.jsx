import { formatCount } from "../../lib/format.js";
import styles from "./Ranking.module.css";

export function StatusFilters({ clientErrorCount, statusCounts, selectedStatusCode, onSelectStatus }) {
  return (
    <div className={styles.filters} role="group" aria-label="ステータスで絞り込む">
      <StatusFilterButton
        label="すべて"
        count={clientErrorCount}
        pressed={selectedStatusCode === null}
        onSelect={() => onSelectStatus(null)}
      />
      {statusCounts.map((status) => (
        <StatusFilterButton
          key={status.statusCode}
          label={String(status.statusCode)}
          count={status.count}
          pressed={selectedStatusCode === status.statusCode}
          onSelect={() => onSelectStatus(status.statusCode)}
        />
      ))}
    </div>
  );
}

function StatusFilterButton({ label, count, pressed, onSelect }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onSelect}>
      {label} {formatCount(count)}
    </button>
  );
}
