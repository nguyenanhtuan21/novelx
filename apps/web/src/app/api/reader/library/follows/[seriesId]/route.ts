import { readerRoute } from "../../../reader-route";

export const dynamic = "force-dynamic";

type FollowRouteContext = { params: Promise<{ seriesId: string }> };

export async function PUT(_request: Request, context: FollowRouteContext) {
  return readerRoute({ method: "PUT", path: await followPath(context) });
}

export async function DELETE(_request: Request, context: FollowRouteContext) {
  return readerRoute({ method: "DELETE", path: await followPath(context) });
}

async function followPath(context: FollowRouteContext): Promise<string> {
  const { seriesId } = await context.params;

  return `/reader/library/follows/${encodeURIComponent(seriesId)}`;
}
