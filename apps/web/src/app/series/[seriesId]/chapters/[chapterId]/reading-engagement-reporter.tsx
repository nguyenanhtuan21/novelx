"use client";

import { useEffect } from "react";

import { recordEngagementRequest } from "../../../../reader-library-client";

const ENGAGEMENT_FLUSH_INTERVAL_MS = 20_000;

/**
 * Reports engaged reading time for the current Chapter, which is what Weekly
 * Engaged Reading Hours is built from.
 *
 * It accumulates time on an interval rather than firing on every pixel scroll,
 * so the metric measures reading rather than how often the page fired. A chunk
 * is only counted while the reader is present — the tab visible and the reader
 * having scrolled since the last flush — so a page left open and walked away
 * from does not inflate the north-star.
 */
export function ReadingEngagementReporter({
  seriesId,
  chapterId,
}: {
  seriesId: string;
  chapterId: string;
}) {
  useEffect(() => {
    let lastFlushedAt = Date.now();
    let hasReadSinceLastFlush = false;

    const markRead = () => {
      hasReadSinceLastFlush = true;
    };

    const flush = () => {
      if (document.visibilityState !== "visible") {
        lastFlushedAt = Date.now();
        hasReadSinceLastFlush = false;
        return;
      }

      if (!hasReadSinceLastFlush) {
        lastFlushedAt = Date.now();
        return;
      }

      const engagedSeconds = Math.round((Date.now() - lastFlushedAt) / 1000);
      lastFlushedAt = Date.now();
      hasReadSinceLastFlush = false;

      if (engagedSeconds <= 0) {
        return;
      }

      void recordEngagementRequest({
        seriesId,
        chapterId,
        engagedSeconds,
        position: Math.round(window.scrollY),
      }).catch(() => {
        hasReadSinceLastFlush = true;
      });
    };

    const handleVisibilityChange = () => {
      lastFlushedAt = Date.now();
      hasReadSinceLastFlush = false;
    };

    window.addEventListener("scroll", markRead, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(flush, ENGAGEMENT_FLUSH_INTERVAL_MS);

    return () => {
      window.removeEventListener("scroll", markRead);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
      flush();
    };
  }, [seriesId, chapterId]);

  return null;
}
