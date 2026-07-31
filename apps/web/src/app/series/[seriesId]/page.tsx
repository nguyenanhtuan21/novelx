import type { PublicCatalogSeries } from "@novelx/shared";
import Link from "next/link";
import React from "react";

import { fetchPublicCorePlatformJson } from "../../core-platform-api";
import { FollowSeriesButton } from "./follow-series-button";

export const dynamic = "force-dynamic";

type SeriesPageProps = {
  params: Promise<{ seriesId: string }>;
};

async function fetchPublicSeries(
  seriesId: string,
): Promise<PublicCatalogSeries> {
  return fetchPublicCorePlatformJson<PublicCatalogSeries>(
    `/catalog/series/${seriesId}`,
    "Series",
  );
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { seriesId } = await params;
  const series = await fetchPublicSeries(seriesId);
  const contentWarnings = series.taxonomy.contentWarnings.join(", ") || "Không";

  return (
    <main className="shell">
      <article className="series-detail" aria-labelledby="series-title">
        <p className="eyebrow">Series công khai NovelX</p>
        <h1 id="series-title">{series.title}</h1>
        <p className="lede">{series.synopsis}</p>

        <dl className="metadata-grid">
          <div>
            <dt>Creative Disclosure</dt>
            <dd>{series.creativeDisclosure}</dd>
          </div>
          <div>
            <dt>Trạng thái phát hành</dt>
            <dd>{series.status}</dd>
          </div>
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
            <dt>Cảnh báo nội dung</dt>
            <dd>{contentWarnings}</dd>
          </div>
        </dl>

        <FollowSeriesButton seriesId={series.id} />

        {series.firstPublicChapterId ? (
          <Link
            className="read-link"
            href={`/series/${series.id}/chapters/${series.firstPublicChapterId}`}
          >
            Đọc chương đầu
          </Link>
        ) : null}
      </article>
    </main>
  );
}
