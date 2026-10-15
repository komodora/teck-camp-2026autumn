import { useState } from "react";
import styles from "./App.module.css";
import { IpMap } from "./features/ip-map";
import { LogUpload } from "./features/log-upload";
import { Ranking } from "./features/ranking";
import { Summary } from "./features/summary";

export function App() {
  const [analysis, setAnalysis] = useState(null);
  const [fileNames, setFileNames] = useState([]);

  function showAnalysis(nextAnalysis, nextFileNames) {
    setAnalysis(nextAnalysis);
    setFileNames(nextFileNames);
  }

  return (
    <main>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Application Load Balancer</p>
        <h1>400系リクエストのランキング</h1>
        <p className={styles.lead}>
          アクセスログをアップロードすると、ALB がクライアントへ返した
          400番台のリクエストを件数順に表示します。200系と400系のクライアントIPは地球儀に、件数が多いほど大きな円で載ります。ログはアップロード用のURLへ送り、400系の集計はブラウザ内で行います。
        </p>
      </header>
      <LogUpload onAnalyzed={showAnalysis} />
      {analysis && (
        <section className={styles.results}>
          <Summary analysis={analysis} fileNames={fileNames} />
          <IpMap ipSummaries={analysis.ipSummaries} />
          <Ranking analysis={analysis} />
        </section>
      )}
    </main>
  );
}
