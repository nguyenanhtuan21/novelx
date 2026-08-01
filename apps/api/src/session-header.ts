/** The token an `<Scheme> <token>` authorization header carries, if any. */
export function schemeToken(
  header: string | string[] | undefined,
  scheme: string,
): string | undefined {
  const value = (Array.isArray(header) ? header[0] : header)?.trim();

  if (!value?.toLowerCase().startsWith(`${scheme.toLowerCase()} `)) {
    return undefined;
  }

  return value.slice(scheme.length + 1).trim() || undefined;
}
