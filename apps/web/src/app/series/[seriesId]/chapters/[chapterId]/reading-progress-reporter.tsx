"use client";

import { useEffect } from "react";

import {
  anonymousSessionCookieValue,
  ensureAnonymousSessionId,
  readerSessionFromCookie,
  recordProgressRequest,
} from "../../../../reader-library-client";

const PROGRESS_REPORT_INTERVAL_MS = 5000;

/**
 * Reports lightweight Chapter progress for the current reader session so the
 * Reader Account library can offer continue-reading. Anonymous Reader Sessions
 * keep reporting too; the upgrade flow carries that progress across.
 */
export function ReadingProgressReporter({
  seriesId,
  chapterId,
}: {
  seriesId: string;
  chapterId: string;
}) {
  useEffect(() => {
    const anonymousSessionId = ensureAnonymousSessionId(document.cookie, () =>
      crypto.randomUUID(),
    );
    document.cookie = anonymousSessionCookieValue(anonymousSessionId);

    let lastReported = -1;

    const report = () => {
      const position = Math.round(window.scrollY);

      if (position === lastReported) {
        return;
      }

      lastReported = position;
      void recordProgressRequest({
        session: readerSessionFromCookie(document.cookie),
        seriesId,
        chapterId,
        position,
      }).catch(() => {
        lastReported = -1;
      });
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
