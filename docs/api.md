# API：画面とサーバー間の取り決め

> 変更は `frontend/` 担当と `backend/` 担当の合意があるときのみ行います。
> 実装：`backend/src/api.js`　／　テスト：`backend/test/api.test.js`

- すべて JSON（写真のアップロードと取得、QR画像だけは画像）。
- エラー時は HTTP ステータス 400 / 404 / 409 などと `{ "error": "日本語のメッセージ" }` を返す。
  画面はこのメッセージをそのまま表示してよい。
- `STAFF_PASSCODE` が設定されている場合、「お客様向け」以外はスタッフ用パスコード（HTTP Basic 認証）が必要。

## お客様向け（パスコード不要）

| メソッドとパス                      | 内容                                   | 返すもの |
|-------------------------------------|----------------------------------------|----------|
| `GET /api/public/tickets/{token}`   | 引換券ページ用（メールアドレスは返さない） | `guest_name, event_name, item_count, stored_count, status, received_at, ticket_token` |
| `GET /api/qr.svg?data=...`          | QRコードの画像（SVG）                  | 画像 |
| `GET /t/{token}`                    | お客様用の引換券ページ（HTML）          | 画面 |

## スタッフ向け

| 業務              | メソッドとパス                                       | 送るもの                                   | 返すもの |
|-------------------|------------------------------------------------------|--------------------------------------------|----------|
| 初期表示          | `GET /api/meta`                                      | —                                          | `staff, itemTypes, events, mailEnabled, storage, db` |
| イベント登録      | `POST /api/events`                                   | `name, venue, starts_at`                   | 登録したイベント |
| お預かり          | `POST /api/deposits`                                 | `guest_name, guest_email?, note?, event_id?, staff_id, items: [{item_type_id, note?}]` | `{ deposit, mail: {sent, reason?} }` |
| 写真              | `POST /api/items/{item_id}/photos`                   | 画像そのもの（`image/jpeg` か `image/png`、8MB まで） | `{ photo_id }` |
| 写真の表示        | `GET /api/photos/{photo_id}`                         | —                                          | 画像 |
| お預かりの取得    | `GET /api/deposits/{deposit_id}`                     | —                                          | deposit（下記） |
| 名前で検索        | `GET /api/deposits?q=名前`                           | —                                          | 保管中のお預かりの一覧 |
| メール再送        | `POST /api/deposits/{deposit_id}/send-ticket`        | —                                          | `{ sent, reason? }` |
| お引き取り受付    | `GET /api/tickets/{token}?staff_id=`                 | —（token はスキャンした文字列やURLでも可） | deposit（下記） |
| 照合              | `POST /api/tickets/{token}/verify`                   | `tag, staff_id`                            | `{ match, result: ok/mismatch/not_found, item_id?, already_returned?, message }` |
| お渡し            | `POST /api/tickets/{token}/items/{item_id}/return`   | `staff_id, method: "tag" または "photo"`    | `{ item_id, status, deposit_status, remaining }` |
| 棚の状況          | `GET /api/locations`                                 | —                                          | `{ shelves: [...棚と中の荷物], unassigned: [...] }` |
| 保管中の荷物      | `GET /api/items?event_id=&item_type_id=`             | —                                          | 荷物の一覧（写真ID・棚・お客様名つき） |

### deposit の形

```json
{
  "deposit_id": 3,
  "ticket_token": "7397820e-....",
  "ticket_url": "https://.../t/7397820e-....",
  "guest_name": "高橋 健",
  "guest_email": null,
  "note": null,
  "status": "stored",
  "event_id": 1,
  "event_name": "山田家・佐藤家 披露宴",
  "received_by_name": "佐藤",
  "received_at": "2026-11-25T02:00:00.000Z",
  "items": [
    {
      "item_id": 4,
      "tag_token": "71eb3a30-....",
      "item_type": "キャリー",
      "size_class": "L",
      "location_code": "A-2",
      "status": "stored",
      "note": null,
      "photo_ids": [1]
    }
  ]
}
```

## 大事なルール

- **お渡しの前に照合が必要**：`method: "tag"` は、直近1時間以内にそのタグを `verify` で
  照合OKにしていないと 409 になる。
- **タグ脱落時**：`method: "photo"` で、写真とお客様への確認によりお渡しできる（記録が残る）。
- **棚の割り当て**：荷物の種類のサイズ（S/M/L）の空き棚を選ぶ。空いていなければ大きい棚、
  それもなければ `location_code: null`（画面に「空き棚なし」と表示）。
- **QRの中身**：引換券QR＝`ticket_token`、荷物タグQR＝`tag_token`（どちらもUUID）。
