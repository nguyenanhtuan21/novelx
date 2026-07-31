import type { PublicCatalogSeries } from "@novelx/shared";
import Link from "next/link";
import React from "react";

export const dynamic = "force-dynamic";

const corePlatformApiUrl =
  process.env.CORE_PLATFORM_API_URL ?? "http://localhost:3001";

async function fetchPublicCatalog(): Promise<PublicCatalogSeries[]> {
  const response = await fetch(new URL("/catalog/series", corePlatformApiUrl), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Core Platform catalog request failed: ${response.status}`);
  }

  return (await response.json()) as PublicCatalogSeries[];
}

export default async function HomePage() {
  const featuredSeries = await fetchPublicCatalog();

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Catalog tuyển chọn NovelX</p>
        <h1 id="hero-title">
          Đọc truyện chữ Việt Nam được biên tập, công khai AI, tối ưu cho
          mobile.
        </h1>
        <p className="lede">
          Nền tảng MVP tập trung vào Series, Chapter, Creative Disclosure,
          Published Snapshot và tiến độ đọc không mất khi tạo Reader Account.
        </p>
      </section>

      <section aria-labelledby="catalog-title" className="catalog">
        <h2 id="catalog-title">Series nổi bật</h2>
        {featuredSeries.map((series) => (
          <article className="series-card" key={series.id}>
            <div>
              <p className="badge">{series.creativeDisclosure}</p>
              <h3>{series.title}</h3>
              <p>{series.synopsis}</p>
            </div>
            <dl>
              <div>
                <dt>Thể loại</dt>
                <dd>
                  {series.taxonomy.genre} / {series.taxonomy.subgenre}
                </dd>
              </div>
              <div>
                <dt>Độ tuổi</dt>
                <dd>{series.taxonomy.ageRating}</dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>{series.status}</dd>
              </div>
              <div>
                <dt>Cảnh báo</dt>
                <dd>{series.taxonomy.contentWarnings.join(", ") || "Không"}</dd>
              </div>
            </dl>
            {series.firstPublicChapterId ? (
              <Link
                className="read-link"
                href={`/series/${series.id}/chapters/${series.firstPublicChapterId}`}
              >
                Đọc chương công khai
              </Link>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
