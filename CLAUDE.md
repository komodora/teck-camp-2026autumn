# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発方針

- このプロジェクトはテストコードを持たない。新しい実装にユニットテスト等を追加する必要はない(過去にテストは意図的に削除されている)。
- 画面はPCブラウザでの利用だけを想定してよい。モバイル幅への最適化や、スマホでの操作性までは考えなくてよい。
- 社内の小さな調査ツール。必要以上に手を込んだ実装(過度な抽象化、将来を見据えた拡張性、設定の外部化など)は避け、素直でシンプルな実装を優先する。

## コマンド

```bash
bun install
bun run dev       # 開発サーバー起動 (Vite)
bun run build     # 本番ビルド (dist/)
bun run preview   # ビルド結果をプレビュー
```

Lint・テストの仕組みはない。

チャット機能(`/report` 内)を使うには、`ANTHROPIC_API_KEY` を `.env` に設定しておく必要がある(未設定でもアップロード・集計・地図機能は動く)。

### 位置情報データの準備(初回のみ)

`data/ipv4-city.bin.gz` はリポジトリに含まれないため、`npm run dev` の前に作る必要がある。

```bash
curl -L -o dbip-city-ipv4.csv.gz \
  https://cdn.jsdelivr.net/npm/@ip-location-db/dbip-city/dbip-city-ipv4.csv.gz
python3 scripts/build-ipv4-locations.py dbip-city-ipv4.csv.gz data/ipv4-city.bin.gz
```

元データは [DB-IP](https://db-ip.com/) City Lite ([ip-location-db](https://github.com/sapics/ip-location-db) 配布、CC BY 4.0)。ダウンロードしたCSVはコミットしない。

## アーキテクチャ

ALBアクセスログをアップロードし、400系(クライアントエラー)リクエストをIP・パス・時間帯の観点で集計して見るための社内ツール。React 19 + Vite のSPAで、バックエンドは独立したサーバーではなく **Viteのdev/previewサーバーに差し込むミドルウェア**(`server/apiPlugin.js` → `configureServer`/`configurePreviewServer`)として実装されている。本番運用も `vite preview` をそのまま使う前提で、Express等の別サーバーは存在しない。

### データの流れ(アップロード→保存→集計)

1. **アップロード**: `src/features/log-upload` がファイルを `POST /upload-logs`(`server/upload/`)へ送る。
2. **構造化**: `server/ingest/structureAlbAccessLog.js` がALBアクセスログの生テキストを1行ずつ固定インデックスでフィールド分解し、`{request_time_utc, client_ip_port, alb_status_code, http_request, ...}` という素朴なJSONレコードに変換する(`server/ingest/pipeline.js`経由)。
3. **保存**: `server/ingest/ndjsonStore.js` がアップロード単位で `data/uploads/<uploadId>.ndjson` に1行1レコードで書き出す。DBは使わず、ファイルがそのまま永続化層になっている(`data/uploads` はgitignore対象)。
4. **検索**: `GET /access-logs`(`server/search/`)が `data/uploads/*.ndjson` を全件読み込んで返す。絞り込みは行わない(フィルタはすべてクライアント側)。
5. **集計**: ルート直下の `analyzeAlbAccessLog.js` が、取得した全レコードから集計を行う。
   - `analyzeAccessLogRecords(records)`: 画面全体向け。パス別ランキング、IPごとの2xx/4xx件数(`ipSummaries`)、IPごとの個別リクエスト(`ipRequests`)などを1回のループで算出する。
   - `buildIpDetail(records, ip)`: IP詳細ページ向け。指定IPの400系のみを対象に、パス別ランキング・時刻帯用の生タイムスタンプ配列・期間を算出する。
   - いずれも `server/ingest/structureAlbAccessLog.js` とは別物(あちらはログ行→JSONレコード、こちらはJSONレコード→表示用集計)なので、どちらを触るべきか注意する。

### チャット(自然言語でのQ&A)

`/report` 画面に埋め込まれた `src/features/chat`(`Chat.jsx`)が、質問と会話履歴を `POST /chat`(`server/chat/`)へ送る。サーバー側は `GET /access-logs` と同じく毎回 `store.loadAll()` で全レコードを読み直し、`analyzeAlbAccessLog.js` の `analyzeAccessLogRecords` で集計し、上位IP(4xx件数降順、上位50件)に `locateIpv4.js` で位置情報を付与して、Claudeへのプロンプトコンテキストを組み立てる(`server/chat/buildAnalysisContext.js`)。IPv4位置テーブルはモジュールレベルで一度だけ読み込んでメモ化する。`server/chat/askClaude.js` が `@anthropic-ai/sdk` を使って `claude-sonnet-5-5` にこのコンテキストと質問を渡し、日本語の回答を1件返す。画面側は会話履歴をReact stateで保持するだけで、サーバー側に集計結果を保存することはしない。

### 画面構成とルーティング

React Router等は使わず、`src/pages.js` が `window.location.pathname` を見てページ種別(`"upload"` / `"report"` / `"ip-detail"`)を判定し、`src/App.jsx` がそれに応じてコンポーネントを切り替えるだけの自作ルータ。画面遷移は通常の `<a href>` によるフルページ遷移で、クライアントサイドの状態は画面間で共有されない(各ページが自分で保存済みログを取得し直す)。Viteのdev/previewはSPA fallbackのため、どのパスでも `index.html` が返る。

- `/`: `src/features/log-upload` (アップロード)
- `/report`: `src/features/report` (`Report.jsx` が `Summary` → `IpMap` → `IpList` → `Ranking` → `Chat` を束ねる)
- `/report/ip/<IP>`: `src/features/ip-detail` (`IpDetail.jsx` が、そのIPの `Ranking`・時刻帯ヒストグラム・位置地図を束ねる)

`src/features/*` は機能ごとのディレクトリで、各ディレクトリは `index.js` でpublicなコンポーネントだけを再exportする(内部実装ファイルを他の機能から直接importしない)。

### 地図・位置情報

- `locateIpv4.js`(ルート直下)が `data/ipv4-city.bin.gz` を読み込み、IPv4アドレスから緯度経度・国コードを二分探索で引く。`scripts/build-ipv4-locations.py` がDB-IPのCSVからこの独自バイナリ形式を生成する。
- `src/features/ip-map/` に地図描画の中核がある: `plotIpSummaries.js`(IP集計→円データへの純粋関数)と `drawIpMap.js`(maplibre-glを直接操作する描画エンジン、UIの状態を持たない)。`IpMap.jsx` はこの2つに時間幅スクラバー/再生/地球儀⇄平面地図切替のUIを載せたもの。
- `src/features/ip-detail/IpLocationMap.jsx` は同じ `drawIpMap.js`/`plotIpSummaries.js` を使うが、スクラバー等のUIは持たず単一IPの位置を1回だけ描画する軽量版。地図関連の変更をするときは、どちらの用途か(全IP+時間操作 vs 単一IP静的表示)を踏まえて `IpMap.jsx` と `IpLocationMap.jsx` のどちらを触るべきか判断する。

### CSS

CSS Modules(`*.module.css`)のみ。共通のデザイントークン(`--ink`, `--muted`, `--line`, `--card`, `--accent`, `--bar` など)は `src/styles/global.css` の `:root` で定義されている。チャート的な表現(ランキングの件数バー、時刻帯ヒストグラム)もライブラリを使わず、素のdiv+CSSで作られている。
