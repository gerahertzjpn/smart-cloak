# データベース

Cloud SQL for PostgreSQL。スキーマは `db/migrations/` のファイルを番号順に適用して作成します。
このドキュメントは現在のスキーマを説明するものです。マイグレーションを追加したら必ず更新してください。

## テーブルの関係

```
staff ──┐ 受付 / 返却したスタッフ
        │
events ──< deposits ──< items ──< item_photos
          （引換券）    （荷物） │
                                >── locations（棚）
                                │
                 item_movements, scan_logs（履歴）
```

## 3種類のQR

| QR               | どこにあるか         | カラム                   | 何を指すか         |
|------------------|----------------------|--------------------------|--------------------|
| 引換券           | お客様のメール       | `deposits.ticket_token`  | 1回のお預かり      |
| 荷物タグ         | 荷物に貼るシール     | `items.tag_token`        | 1つの荷物          |
| 棚               | 棚に貼るシール       | `locations.code`         | 1つの棚            |

返却時の照合：荷物の `items.deposit_id` が、読み取った引換券の `deposit_id` と一致すればOK。

## テーブル一覧

| テーブル            | 内容                                             |
|---------------------|--------------------------------------------------|
| `staff`             | クロークのスタッフ                               |
| `events`            | 宴会・イベント（会場、開始・終了時刻）           |
| `locations`         | 棚：コード `A-3`、サイズ S/M/L、収容数           |
| `item_types`        | 荷物の種類：キャリー、手荷物、紙袋、コート       |
| `deposits`          | 1回のお預かり＝引換券1枚：氏名、メール、状態     |
| `items`             | 荷物1つ：種類、棚、状態                          |
| `item_photos`       | Cloud Storage 上の写真のパス                     |
| `item_movements`    | 荷物の棚移動の履歴                               |
| `scan_logs`         | すべての読み取りとその結果                       |
| `schema_migrations` | 適用済みのマイグレーション                       |

## 状態（status）

- `deposits.status`：`stored`（保管中）→ `partially_returned`（一部返却）→ `returned`（返却済み）、または `cancelled`
- `items.status`：`stored`（保管中）→ `returned`（返却済み）、または `lost`（紛失）

レコードは削除せず、状態を変更します。`returned` にするときは
「誰が・いつ返却したか」の記録が必須です（DBのCHECK制約で強制）。

## ビュー

- `v_location_usage`：棚ごとの使用数と空き数。
- `v_ticket_items`：引換券1枚分の荷物・棚・写真の一覧。

## DBユーザー

| ユーザー    | 使う人・プログラム | 権限                                         |
|-------------|--------------------|----------------------------------------------|
| `postgres`  | DB担当             | すべて（スキーマ変更を含む）                 |
| `app_user`  | サーバー           | SELECT / INSERT / UPDATE、DELETE は写真のみ  |

## 個人情報

`deposits.guest_email` は返却から30日後に削除します（`db/queries.sql` のクエリ7）。
