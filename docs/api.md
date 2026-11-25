# API：画面とサーバー間の取り決め

> 下書きです。変更は `frontend/` 担当と `backend/` 担当の合意があるときのみ行います。
> ここには「画面が何を送り、何を受け取るか」を書きます。内部の実装は書きません。

| 業務の手順       | メソッドとパス                         | 画面が送るもの                             | 画面が受け取るもの             |
|------------------|----------------------------------------|--------------------------------------------|--------------------------------|
| お預かり         | `POST /deposits`                       | 氏名、メール、event_id、荷物（種類・特記事項） | deposit_id、荷物ごとの棚     |
| 荷物の写真       | `POST /items/{item_id}/photos`         | 画像ファイル                               | photo_id                       |
| タグ印刷         | `GET /items/{item_id}/label`           | —                                          | QRシール用のデータ             |
| お引き取り受付   | `GET /tickets/{ticket_token}`          | —                                          | お客様、荷物、写真、棚         |
| 照合             | `POST /tickets/{ticket_token}/verify`  | tag_token                                  | 一致 / 不一致                  |
| お渡し           | `POST /items/{item_id}/return`         | staff_id                                   | 新しい状態                     |
| 空き棚           | `GET /locations?free=true`             | サイズ S/M/L                               | 棚の一覧                       |
| 未返却の荷物     | `GET /events/{event_id}/remaining`     | —                                          | 荷物と棚の一覧                 |

TODO（チーム）：各リクエストの JSON の項目とエラーコードを決める。
