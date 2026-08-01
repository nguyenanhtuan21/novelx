# NovelX

NovelX là nền tảng monorepo nhẹ cho MVP digital story platform và AI-enabled content studio.

## Cấu Trúc Repo

- `apps/web`: ứng dụng web Next.js cho trải nghiệm đọc và catalog.
- `apps/api`: NestJS Core Platform API.
- `apps/ai-factory`: thư mục Python cho AI Factory workflow và smoke check, được bọc bằng npm scripts.
- `packages/shared`: shared domain contracts bằng TypeScript.

## Cài đặt

```bash
npm install
```

Yêu cầu Node.js 22+ và Python 3.10+.

## Lệnh Sẵn Sàng Cho CI

```bash
npm run verify
```

`verify` chạy kiểm tra định dạng, lint, TypeScript typecheck, TypeScript/Python tests, smoke checks cho workspace, production builds, và `npm audit` để giữ dependency tree không có lỗ hổng bảo mật.

Các lệnh riêng cũng có sẵn:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run smoke
npm run build
npm audit
```

## Truy Cập Staff Account

Staff Account tách khỏi Reader Account: staff đăng nhập ở ranh giới riêng và mọi thao tác staff đều để lại Staff Audit Record. Xem `docs/adr/0013-staff-sessions-on-their-own-boundary-with-an-audit-trail.md`.

Core Platform API đọc hai biến môi trường:

- `STAFF_ACCOUNTS`: mảng JSON `[{ "id", "permissions", "credentialSha256" }]`. Không cấu hình nghĩa là deployment không có staff nào.
- `STAFF_SESSION_SECRET`: secret ký staff session token, tách khỏi `READER_SESSION_SECRET`. Không đặt thì secret sinh theo tiến trình và staff session mất sau khi restart.

Tạo `credentialSha256` từ credential cấp cho một operator:

```bash
printf %s "$STAFF_CREDENTIAL" | shasum -a 256
```

Đăng nhập bằng `POST /staff/sessions` với `{ "staffAccountId", "credential" }`, rồi gọi thao tác staff kèm header `X-Staff-Authorization: Staff <token>`.

## Staff CMS

Staff CMS là nơi một Series trở thành nội dung được quản trị. Mọi thao tác đều đi qua cùng một cổng phân quyền và để lại Staff Audit Record, kể cả khi bị từ chối.

| Thao tác                 | Endpoint                                        | Permission      |
| ------------------------ | ----------------------------------------------- | --------------- |
| Tạo Series               | `POST /staff/series`                            | `series:write`  |
| Cập nhật metadata Series | `PUT /staff/series/:seriesId`                   | `series:write`  |
| Đọc Series, Canon, draft | `GET /staff/series/:seriesId`                   | `series:read`   |
| Định nghĩa/sửa Canon     | `PUT /staff/series/:seriesId/story-bible`       | `canon:write`   |
| Lock Story Bible         | `POST /staff/series/:seriesId/story-bible/lock` | `canon:write`   |
| Soạn draft Chapter       | `POST /staff/series/:seriesId/chapters`         | `chapter:write` |

Canon đã lock vẫn sửa được, nhưng phải kèm `reason`; thiếu nó thì API trả `409` với `{ "error": "canon-change-requires-reason" }`. Xem `docs/adr/0014-locked-canon-changes-need-a-named-reason.md`.

Draft Chapter không có đường ra công khai: người đọc chỉ tiếp cận Published Snapshot qua catalog, nên draft nằm ngoài mọi read path công khai theo cấu trúc chứ không phải nhờ một cờ phải nhớ kiểm tra.

## Provenance Ledger

Mỗi thao tác nội dung thành công trong Staff CMS ghi thêm một provenance entry: nguồn (Staff Account hoặc AI workflow run), action, artifact được truy vết, và version context của artifact đó tại thời điểm ấy. Ledger chỉ nhận thêm, không sửa và không xoá; một thao tác bị từ chối không để lại lineage vì không có gì được tạo ra — bằng chứng cho lần thử đó nằm ở Staff Audit Record. Xem `docs/adr/0016-lineage-is-appended-where-content-changes.md`.

| Thao tác                     | Endpoint                                                       | Permission        |
| ---------------------------- | -------------------------------------------------------------- | ----------------- |
| Đọc lineage của một Series   | `GET /staff/series/:seriesId/provenance`                       | `provenance:read` |
| Đọc lineage của một artifact | `GET /staff/series/:seriesId/provenance/:targetKind/:targetId` | `provenance:read` |

`targetKind` là một trong `series`, `story-bible`, `chapter-draft`, `published-snapshot`. Cả hai endpoint trả entry mới nhất trước, nhận `?limit=` với mặc định 50 và tối đa 500.

## Quality Gate

Quality Gate là tập kiểm tra một draft Chapter phải vượt qua trước khi publish công khai. Gate đa điều kiện: mỗi điều kiện được trả lời riêng, và điều kiện không ai kiểm tra là _blocking failure_ chứ không phải pass. Điểm số chỉ để đọc — điểm tổng hợp cao không bao giờ ghi đè được một blocking failure. Xem `docs/adr/0017-the-quality-gate-blocks-on-unanswered-conditions.md`.

| Thao tác             | Endpoint                                                        | Permission             |
| -------------------- | --------------------------------------------------------------- | ---------------------- |
| Chạy Quality Gate    | `POST /staff/series/:seriesId/chapters/:chapterId/quality-gate` | `chapter:quality-gate` |
| Xem kết quả gần nhất | `GET /staff/series/:seriesId/chapters/:chapterId/quality-gate`  | `series:read`          |

Body của lần chạy nêu các kiểm tra đã thực hiện:

```json
{
  "reportedChecks": [
    { "condition": "canonContinuity", "verdict": "pass", "score": 96 },
    { "condition": "policySafety", "verdict": "pass", "score": 99 },
    { "condition": "originalityIp", "verdict": "pass", "score": 97 },
    {
      "condition": "metadata",
      "verdict": "warning",
      "note": "Thiếu trope phụ."
    }
  ]
}
```

`condition` chỉ nhận bốn điều kiện là phán xét về nội dung: `canonContinuity`, `policySafety`, `originalityIp`, `metadata`. Ba điều kiện còn lại — `rightsRecord`, `provenanceLedger`, `humanApproval` — do bản ghi trả lời (Rights Record, lineage trong Provenance Ledger, phê duyệt của người review), nên gate từ chối `400` nếu request báo cáo thay cho chúng. `verdict` là `pass`, `warning`, hoặc `blocking-failure`.

Mỗi lần chạy ghi thêm một provenance entry `chapter-draft.quality-gate` nêu kết luận của nó; đọc kết quả không ghi gì.

## Đường Dẫn Kiểm Tra Nhanh

- Web: `GET /health` trả về `{ "service": "novelx-web", "status": "ok" }`.
- Core Platform API: `GET /health` trả về `{ "service": "core-platform-api", "status": "ok" }`.
- AI Factory: `npm --workspace @novelx/ai-factory run smoke` in ra `{ "service": "ai-factory", "status": "ok" }`.
