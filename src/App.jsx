import styles from "./App.module.css";
import { IpDetail } from "./features/ip-detail";
import { LogUpload } from "./features/log-upload";
import { Report } from "./features/report";
import { currentIpParam, currentPage, reportPagePath, uploadPagePath } from "./pages.js";

export function App() {
  const page = currentPage();
  const isReportSection = page === "report" || page === "ip-detail";

  return (
    <main>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Application Load Balancer</p>
        <h1>400系リクエストのランキング</h1>
        <p className={styles.lead}>{pageLead(page)}</p>
        <nav className={styles.nav} aria-label="画面">
          <a href={uploadPagePath} aria-current={page === "upload" ? "page" : undefined}>
            アップロード
          </a>
          <a href={reportPagePath} aria-current={isReportSection ? "page" : undefined}>
            ランキング
          </a>
        </nav>
      </header>
      {renderPage(page)}
    </main>
  );
}

function renderPage(page) {
  if (page === "report") return <Report />;
  if (page === "ip-detail") return <IpDetail ip={currentIpParam()} />;
  return <LogUpload />;
}

function pageLead(page) {
  if (page === "report") {
    return "データを取得すると、保存済みのアクセスログから400系のランキングと、200系・400系のクライアントIPの地球儀を表示します。";
  }
  if (page === "ip-detail") {
    return "選択したクライアントIPが400系で叩いたパスと、時刻帯のパターン、推定位置を表示します。";
  }
  return "ログファイルを送ると、サーバがパースして保存します。集計はランキング画面で、取得ボタンを押したときに行います。";
}
