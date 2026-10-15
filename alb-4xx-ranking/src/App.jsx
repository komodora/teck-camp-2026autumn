import styles from "./App.module.css";
import { LogUpload } from "./features/log-upload";
import { Report } from "./features/report";
import { currentPage, reportPagePath, uploadPagePath } from "./pages.js";

export function App() {
  const page = currentPage();

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
          <a href={reportPagePath} aria-current={page === "report" ? "page" : undefined}>
            ランキング
          </a>
        </nav>
      </header>
      {page === "report" ? <Report /> : <LogUpload />}
    </main>
  );
}

function pageLead(page) {
  if (page === "report") {
    return "データを取得すると、保存済みのアクセスログから400系のランキングと、200系・400系のクライアントIPの地球儀を表示します。";
  }
  return "ログファイルを送ると、サーバがパースして保存します。集計はランキング画面で、取得ボタンを押したときに行います。";
}
