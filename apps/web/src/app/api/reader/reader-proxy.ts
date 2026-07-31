const corePlatformApiUrl =
  process.env.CORE_PLATFORM_API_URL ?? "http://localhost:3001";

export type ReaderProxyResult = {
  status: number;
  body: unknown;
  /** A newly issued reader session token the caller should store in the cookie. */
  token?: string;
};

/**
 * Calls the Core Platform reader boundary on behalf of the browser.
 *
 * The reader session token never leaves the server: it arrives from an
 * HttpOnly cookie, goes out as a bearer token, and any token Core Platform
 * issues comes back for the caller to re-store rather than going to the page.
 */
export async function readerProxy(input: {
  token: string | undefined;
  method: string;
  path: string;
  body?: unknown;
  startSession?: boolean;
}): Promise<ReaderProxyResult> {
  let token = input.token;
  let issuedToken: string | undefined;

  if (!token && input.startSession) {
    issuedToken = await startAnonymousSession();
    token = issuedToken;
  }

  const response = await callCorePlatform({
    token,
    method: input.method,
    path: input.path,
    body: input.body,
  });
  const body = await readJson(response);
  const upgradedToken = tokenFrom(body);

  return {
    status: response.status,
    body: upgradedToken ? withoutToken(body) : body,
    ...((upgradedToken ?? issuedToken)
      ? { token: upgradedToken ?? issuedToken }
      : {}),
  };
}

async function startAnonymousSession(): Promise<string | undefined> {
  const response = await callCorePlatform({
    token: undefined,
    method: "POST",
    path: "/reader/sessions",
  });

  return tokenFrom(await readJson(response));
}

async function callCorePlatform(input: {
  token: string | undefined;
  method: string;
  path: string;
  body?: unknown;
}): Promise<Response> {
  return fetch(`${corePlatformApiUrl}${input.path}`, {
    method: input.method,
    cache: "no-store",
    headers: {
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function tokenFrom(body: unknown): string | undefined {
  const token = (body as { token?: unknown })?.token;

  return typeof token === "string" && token ? token : undefined;
}

function withoutToken(body: unknown): unknown {
  const rest = { ...(body as Record<string, unknown>) };
  delete rest.token;

  return rest;
}
