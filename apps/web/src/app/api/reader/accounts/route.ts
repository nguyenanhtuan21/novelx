import { readerRoute } from "../reader-route";

export const dynamic = "force-dynamic";

export async function POST() {
  return readerRoute({
    method: "POST",
    path: "/reader/accounts",
    startSession: true,
  });
}
