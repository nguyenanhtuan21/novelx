import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: "NovelX",
  description: "Truyện chữ Việt Nam tuyển chọn với công khai AI minh bạch.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
