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

## Đường Dẫn Kiểm Tra Nhanh

- Web: `GET /health` trả về `{ "service": "novelx-web", "status": "ok" }`.
- Core Platform API: `GET /health` trả về `{ "service": "core-platform-api", "status": "ok" }`.
- AI Factory: `npm --workspace @novelx/ai-factory run smoke` in ra `{ "service": "ai-factory", "status": "ok" }`.
