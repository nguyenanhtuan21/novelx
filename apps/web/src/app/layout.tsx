import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: "NovelX",
  description: "Curated Vietnamese serialized stories with transparent AI involvement.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
