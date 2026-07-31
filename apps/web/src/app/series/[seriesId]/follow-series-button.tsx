"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";

import {
  fetchReaderLibraryRequest,
  followSeriesRequest,
  readerSessionFromCookie,
  unfollowSeriesRequest,
} from "../../reader-library-client";

type FollowState =
  | { kind: "unknown" }
  | { kind: "anonymous" }
  | { kind: "reader"; readerAccountId: string; following: boolean };

export function FollowSeriesButton({ seriesId }: { seriesId: string }) {
  const [state, setState] = useState<FollowState>({ kind: "unknown" });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const { readerAccountId } = readerSessionFromCookie(document.cookie);

    if (!readerAccountId) {
      setState({ kind: "anonymous" });
      return;
    }

    let active = true;
    fetchReaderLibraryRequest({ readerAccountId }).then((library) => {
      if (!active) {
        return;
      }

      setState({
        kind: "reader",
        readerAccountId,
        following: library.entries.some(
          (entry) => entry.series.id === seriesId,
        ),
      });
    });

    return () => {
      active = false;
    };
  }, [seriesId]);

  if (state.kind === "anonymous") {
    return (
      <p className="follow-control" data-series-id={seriesId}>
        <Link className="read-link" href="/reader-account/upgrade">
          Tạo Reader Account để theo dõi Series
        </Link>
      </p>
    );
  }

  const following = state.kind === "reader" && state.following;

  return (
    <p className="follow-control" data-series-id={seriesId}>
      <button
        type="button"
        aria-pressed={following}
        disabled={state.kind === "unknown" || pending}
        onClick={async () => {
          if (state.kind !== "reader") {
            return;
          }

          setPending(true);
          try {
            const request = following
              ? unfollowSeriesRequest
              : followSeriesRequest;
            await request({ seriesId, readerAccountId: state.readerAccountId });
            setState({ ...state, following: !following });
          } finally {
            setPending(false);
          }
        }}
      >
        {following ? "Bỏ theo dõi" : "Theo dõi"}
      </button>
    </p>
  );
}
