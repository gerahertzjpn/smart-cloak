# サーバー（backend）

Node.js + Express。API（`/api/...`）と、`frontend/` の画面を1つのサーバーで配信します。

| ファイル            | 内容                                                 |
|---------------------|------------------------------------------------------|
| `src/server.js`     | 入口。設定の読み込み、エラー処理                     |
| `src/api.js`        | API のルート（`docs/api.md` と対応）                 |
| `src/db.js`         | DB接続（Cloud SQL、または PC内の PGlite）            |
| `src/storage.js`    | 写真の保存（Cloud Storage、または PC内のフォルダ）  |
| `src/mail.js`       | 引換券メールの送信（設定がなければ送らない）         |
| `src/auth.js`       | スタッフ用パスコード                                 |
| `test/api.test.js`  | API の自動テスト（`npm test`）                       |
| `.env.example`      | 設定の例                                             |

## コマンド

```bash
npm install     # 最初の1回
npm run dev     # 開発用に起動（ファイルを保存すると自動で再起動）→ http://localhost:8080
npm test        # 自動テスト
```

自分のPCでは DB に PGlite（PC内で動く PostgreSQL）を使うため、何もインストールせずに動きます。
データは `backend/.data/` に保存されます。最初からやり直したいときは、サーバーを止めてこのフォルダを削除してください。
