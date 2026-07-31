import { notFound } from "next/navigation";

const corePlatformApiUrl =
  process.env.CORE_PLATFORM_API_URL ?? "http://localhost:3001";

export class CorePlatformRequestError extends Error {
  constructor(
    readonly status: number,
    resourceName: string,
  ) {
    super(`Core Platform ${resourceName} request failed: ${status}`);
    this.name = "CorePlatformRequestError";
  }
}

/** Public catalog reads need no reader session; `fetchCorePlatformJson` carries one. */
export async function fetchPublicCorePlatformJson<T>(
  path: string,
  resourceName: string,
): Promise<T> {
  return fetchCorePlatformJson<T>(path, resourceName);
}

export async function fetchCorePlatformJson<T>(
  path: string,
  resourceName: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(new URL(path, corePlatformApiUrl), {
    cache: "no-store",
    ...init,
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new CorePlatformRequestError(response.status, resourceName);
  }

  return (await response.json()) as T;
}
