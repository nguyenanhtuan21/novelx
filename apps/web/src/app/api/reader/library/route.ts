import { readerRoute } from "../reader-route";

export const dynamic = "force-dynamic";

export async function GET() {
  return readerRoute({ method: "GET", path: "/reader/library" });
}
