import { notFound } from "next/navigation";

const corePlatformApiUrl =
  process.env.CORE_PLATFORM_API_URL ?? "http://localhost:3001";

export async function fetchPublicCorePlatformJson<T>(
  path: string,
  resourceName: string,
): Promise<T> {
  const response = await fetch(new URL(path, corePlatformApiUrl), {
    cache: "no-store",
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(
      `Core Platform ${resourceName} request failed: ${response.status}`,
    );
  }

  return (await response.json()) as T;
}
