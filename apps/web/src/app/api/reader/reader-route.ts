import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  READER_SESSION_COOKIE,
  readerSessionCookie,
} from "../../reader-session";
import { readerProxy } from "./reader-proxy";

/**
 * Runs one reader-boundary call for the browser: reads the session token from
 * the HttpOnly cookie, proxies the call, and re-stores any token Core Platform
 * issued. The token itself never reaches the page.
 */
export async function readerRoute(input: {
  method: string;
  path: string;
  body?: unknown;
  startSession?: boolean;
}): Promise<NextResponse> {
  const jar = await cookies();
  const result = await readerProxy({
    token: jar.get(READER_SESSION_COOKIE)?.value,
    method: input.method,
    path: input.path,
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.startSession === undefined
      ? {}
      : { startSession: input.startSession }),
  });
  const response = NextResponse.json(result.body, { status: result.status });

  if (result.token) {
    response.cookies.set(readerSessionCookie(result.token));
  }

  return response;
}

export async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
