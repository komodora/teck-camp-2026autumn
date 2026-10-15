# ALB 400系リクエストのランキング

アクセスログをブラウザに読み込み、400系の件数と、200系・400系を返したクライアントIPの分布を表示します。分布は地球儀に載ります。

位置の検索に使う `alb-4xx-ranking/data/ipv4-city.bin.gz` はリポジトリに含まれません。下記の手順で作ってから起動してください。

## 位置情報データを作る

元データは [DB-IP](https://db-ip.com/) City Lite を [ip-location-db](https://github.com/sapics/ip-location-db) が配布している IPv4 の CSV です。ライセンスは Creative Commons Attribution 4.0 International です。

リポジトリのルートで実行します。

```bash
curl -L -o dbip-city-ipv4.csv.gz \
  https://cdn.jsdelivr.net/npm/@ip-location-db/dbip-city/dbip-city-ipv4.csv.gz

python3 alb-4xx-ranking/scripts/build-ipv4-locations.py \
  dbip-city-ipv4.csv.gz \
  alb-4xx-ranking/data/ipv4-city.bin.gz
```

スクリプトは CSV から IPv4 の範囲、緯度、経度、国コードだけを取り、`alb-4xx-ranking/data/ipv4-city.bin.gz` を書き出します。ダウンロードした CSV はコミットしないでください。

## 起動

```bash
cd alb-4xx-ranking
npm install
npm test
npm run dev
```

`npm test` の位置情報テストも、同じ `data/ipv4-city.bin.gz` を読みます。
