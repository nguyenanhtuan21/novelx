import { createSeries } from "@novelx/shared";
import Link from "next/link";

const featuredSeries = [
  createSeries({
    id: "thanh-kiem-trong-mua",
    title: "Thanh Kiem Trong Mua",
    synopsis: "Kiem hiep, mua dem, va mot loi the cu duoc bien tap cho trai nghiem doc mobile.",
    creativeDisclosure: "Hybrid",
    taxonomy: {
      genre: "fantasy",
      subgenre: "kiem-hiep",
      tropes: ["hidden-lineage"],
      moods: ["hopeful"],
      themes: ["loyalty"],
      audience: "young-adult",
      ageRating: "13+",
      contentWarnings: ["violence"],
    },
    status: "active",
  }),
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Catalog tuyển chọn NovelX</p>
        <h1 id="hero-title">Đọc truyện chữ Việt Nam được biên tập, công khai AI, tối ưu cho mobile.</h1>
        <p className="lede">
          MVP foundation tập trung vào Series, Chapter, Creative Disclosure, Published Snapshot và tiến độ đọc
          không mất khi tạo Reader Account.
        </p>
      </section>

      <section aria-labelledby="catalog-title" className="catalog">
        <h2 id="catalog-title">Series noi bat</h2>
        {featuredSeries.map((series) => (
          <article className="series-card" key={series.id}>
            <div>
              <p className="badge">{series.creativeDisclosure}</p>
              <h3>{series.title}</h3>
              <p>{series.synopsis}</p>
            </div>
            <dl>
              <div>
                <dt>The loai</dt>
                <dd>{series.taxonomy.genre} / {series.taxonomy.subgenre}</dd>
              </div>
              <div>
                <dt>Do tuoi</dt>
                <dd>{series.taxonomy.ageRating}</dd>
              </div>
              <div>
                <dt>Canh bao</dt>
                <dd>{series.taxonomy.contentWarnings.join(", ") || "Khong"}</dd>
              </div>
            </dl>
            <Link className="read-link" href={`/series/${series.id}/chapters/chuong-1`}>
              Đọc chương công khai
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
