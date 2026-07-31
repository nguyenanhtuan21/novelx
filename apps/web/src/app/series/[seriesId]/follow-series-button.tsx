"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";

import {
  fetchReaderLibraryRequest,
  followSeriesRequest,
  unfollowSeriesRequest,
  type ReaderLibraryResult,
} from "../../reader-library-client";

type FollowState =
  | { kind: "unknown" }
  | { kind: "upgrade-required" }
  | { kind: "reader"; following: boolean };

export function FollowSeriesButton({ seriesId }: { seriesId: string }) {
  const [state, setState] = useState<FollowState>({ kind: "unknown" });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    fetchReaderLibraryRequest().then((result) => {
      if (active) {
        setState(followState(result, seriesId));
      }
    });

    return () => {
      active = false;
    };
  }, [seriesId]);

  if (state.kind === "upgrade-required") {
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
          setPending(true);
          try {
            const request = following
              ? unfollowSeriesRequest
              : followSeriesRequest;

            setState(followState(await request({ seriesId }), seriesId));
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

function followState(
  result: ReaderLibraryResult,
  seriesId: string,
): FollowState {
  if (result.kind === "upgrade-required") {
    return { kind: "upgrade-required" };
  }

  return {
    kind: "reader",
    following: result.library.entries.some(
      (entry) => entry.series.id === seriesId,
    ),
  };
}
