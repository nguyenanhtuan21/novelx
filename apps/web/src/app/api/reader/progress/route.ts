import { readerRoute, requestJson } from "../reader-route";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return readerRoute({
    method: "PUT",
    path: "/reader/progress",
    body: await requestJson(request),
    startSession: true,
  });
}
