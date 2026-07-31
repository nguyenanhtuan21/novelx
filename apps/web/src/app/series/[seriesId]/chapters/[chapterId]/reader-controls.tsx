"use client";

import { useState } from "react";

const themes = ["paper", "night"] as const;
const themeLabels: Record<(typeof themes)[number], string> = {
  paper: "Giấy",
  night: "Đêm",
};

export function ReaderControls() {
  const [theme, setTheme] = useState<(typeof themes)[number]>("paper");
  const [fontScale, setFontScale] = useState(1);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [readingWidth, setReadingWidth] = useState(720);

  function setReaderVariable(name: string, value: string) {
    document.documentElement.style.setProperty(name, value);
  }

  return (
    <section
      className="reader-controls"
      aria-label="Tùy chỉnh trình đọc"
      data-theme={theme}
    >
      <label>
        Giao diện
        <select
          value={theme}
          onChange={(event) => {
            const nextTheme = event.target.value as (typeof themes)[number];
            setTheme(nextTheme);
            setReaderVariable(
              "--reader-bg",
              nextTheme === "night" ? "#16120f" : "#fbf1df",
            );
            setReaderVariable(
              "--reader-fg",
              nextTheme === "night" ? "#f7ead6" : "#23190f",
            );
          }}
        >
          {themes.map((candidate) => (
            <option key={candidate} value={candidate}>
              {themeLabels[candidate]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cỡ chữ
        <input
          min="0.9"
          max="1.4"
          step="0.1"
          type="range"
          value={fontScale}
          onChange={(event) => {
            const nextFontScale = Number(event.target.value);
            setFontScale(nextFontScale);
            setReaderVariable("--reader-font-scale", String(nextFontScale));
          }}
        />
      </label>
      <label>
        Giãn dòng
        <input
          min="1.5"
          max="2.2"
          step="0.1"
          type="range"
          value={lineHeight}
          onChange={(event) => {
            const nextLineHeight = Number(event.target.value);
            setLineHeight(nextLineHeight);
            setReaderVariable("--reader-line-height", String(nextLineHeight));
          }}
        />
      </label>
      <label>
        Độ rộng dòng
        <input
          min="560"
          max="860"
          step="20"
          type="range"
          value={readingWidth}
          onChange={(event) => {
            const nextReadingWidth = Number(event.target.value);
            setReadingWidth(nextReadingWidth);
            setReaderVariable("--reader-width", `${nextReadingWidth}px`);
          }}
        />
      </label>
      <output aria-label="Thiết lập hiện tại">
        {fontScale.toFixed(1)}x / {lineHeight.toFixed(1)} / {readingWidth}px
      </output>
    </section>
  );
}
