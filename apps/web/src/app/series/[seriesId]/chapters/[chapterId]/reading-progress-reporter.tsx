"use client";

import { useEffect } from "react";

import { recordProgressRequest } from "../../../../reader-library-client";

const PROGRESS_REPORT_INTERVAL_MS = 5000;

/**
 * Reports lightweight Chapter progress for the current reader session so the
 * Reader Account library can offer continue-reading. Anonymous Reader Sessions
 * keep reporting too — the reader route starts one when needed, and the
 * upgrade flow carries that progress across.
 */
export function ReadingProgressReporter({
  seriesId,
  chapterId,
}: {
  seriesId: string;
  chapterId: string;
}) {
  useEffect(() => {
    let lastReported = -1;

    const report = () => {
      const position = Math.round(window.scrollY);

      if (position === lastReported) {
        return;
      }

      lastReported = position;
      void recordProgressRequest({ seriesId, chapterId, position }).catch(
        () => {
          lastReported = -1;
        },
      );
    };

    report();
    const timer = window.setInterval(report, PROGRESS_REPORT_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      report();
    };
  }, [seriesId, chapterId]);

  return null;
}
