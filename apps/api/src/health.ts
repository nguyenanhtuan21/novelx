export function getHealthResponse() {
  return {
    service: "core-platform-api",
    status: "ok",
  } as const;
}
