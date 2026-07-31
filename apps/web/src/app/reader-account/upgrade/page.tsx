"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { useState } from "react";

import { upgradeToReaderAccountRequest } from "../../reader-library-client";

export default function UpgradeReaderAccountPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <main className="shell">
      <section className="upgrade-prompt" aria-labelledby="upgrade-title">
        <p className="eyebrow">Reader Account NovelX</p>
        <h1 id="upgrade-title">Tạo Reader Account</h1>
        <p className="lede">
          Tiến độ đọc của phiên ẩn danh sẽ được chuyển sang Reader Account mới,
          và bạn có thể theo dõi Series để dựng thư viện của mình.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setFailed(false);

            try {
              await upgradeToReaderAccountRequest();
              router.push("/library");
              router.refresh();
            } catch {
              setFailed(true);
            } finally {
              setPending(false);
            }
          }}
        >
          Tạo Reader Account và giữ tiến độ đọc
        </button>
        {failed ? (
          <p role="alert">
            Chưa tạo được Reader Account. Vui lòng thử lại sau ít phút.
          </p>
        ) : null}
      </section>
    </main>
  );
}
