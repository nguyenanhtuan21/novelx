import { readerRoute, requestJson } from "../reader-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return readerRoute({
    method: "POST",
    path: "/reader/engagement",
    body: await requestJson(request),
    startSession: true,
  });
}
