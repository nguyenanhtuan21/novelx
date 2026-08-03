import { test, expect } from "@playwright/test";

const SERIES_PATH = "/series/thanh-kiem-trong-mua";
const CHAPTER_PATH = `${SERIES_PATH}/chapters/chuong-1`;
const PERSONA_NAME = "May Ke Chuyen Mua Kiem";
const PERSONA_DISCLOSURE = "AI-operated creative persona";

test.describe("issue #15 — AI Persona content lines with AI-Assisted disclosure", () => {
  test("public catalog surfaces the AI-Assisted badge on the Series card", async ({
    page,
  }) => {
    await page.goto("/");

    const seriesCard = page
      .locator(".series-card", { hasText: "Thanh Kiếm Trong Mưa" })
      .first();

    await expect(
      seriesCard.locator(".badge", { hasText: "AI-Assisted" }),
    ).toBeVisible();
    await expect(
      seriesCard.getByRole("link", { name: "Xem Series" }),
    ).toHaveAttribute("href", SERIES_PATH);
  });

  test("public Series page shows the AI-Assisted disclosure and the AI Persona", async ({
    page,
  }) => {
    await page.goto(SERIES_PATH);

    await expect(
      page.getByRole("heading", { name: "Thanh Kiếm Trong Mưa" }),
    ).toBeVisible();

    const metadata = page.locator(".metadata-grid");
    await expect(metadata.getByText("Creative Disclosure")).toBeVisible();
    await expect(metadata.getByText("AI-Assisted")).toBeVisible();

    await expect(metadata.getByText("AI Persona")).toBeVisible();
    await expect(metadata.getByText(PERSONA_NAME)).toBeVisible();
    await expect(metadata.getByText(PERSONA_DISCLOSURE)).toBeVisible();
  });

  test("public Chapter reader shows the AI-Assisted disclosure and the AI Persona", async ({
    page,
  }) => {
    await page.goto(CHAPTER_PATH);

    await expect(
      page.getByRole("heading", { name: "Mùi Mưa Đầu Tiên" }),
    ).toBeVisible();

    const header = page.locator(".reader-header");
    await expect(header.getByText("Công khai AI:")).toBeVisible();
    await expect(header.getByText("AI-Assisted")).toBeVisible();

    await expect(header.getByText("AI Persona:")).toBeVisible();
    await expect(header.getByText(PERSONA_NAME)).toBeVisible();
    await expect(header.getByText(PERSONA_DISCLOSURE)).toBeVisible();

    await expect(page.locator("[data-chapter-id='chuong-1']")).toBeVisible();
  });

  test("a reader can follow the disclosure from catalog into the Chapter reader", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator(".series-card", { hasText: "Thanh Kiếm Trong Mưa" })
      .first()
      .getByRole("link", { name: "Đọc chương công khai" })
      .click();

    await expect(page).toHaveURL(CHAPTER_PATH);
    await expect(page.getByText("AI-Assisted")).toBeVisible();
    await expect(page.getByText(PERSONA_NAME)).toBeVisible();
  });
});
