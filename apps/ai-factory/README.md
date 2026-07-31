# NovelX AI Factory

AI Factory là control plane nội bộ cho các workflow AI-assisted của NovelX. MVP giữ AI Factory tách khỏi Core Platform code và dùng package này làm nền tảng Python worker/workflow cho model tooling và evaluation tooling.

Temporal là durable workflow runtime dự kiến. Seam đầu tiên này giữ workflow contract thuần và testable trước khi Temporal worker adapter được nối vào.
