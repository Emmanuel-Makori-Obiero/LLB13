// Server-only secret helpers. Values are never returned to the client.
export type SecretKeyEntry = { slot: number; value: string };

export function secretKeyEntries(baseName: string): SecretKeyEntry[] {
  const entries: SecretKeyEntry[] = [];
  const seen = new Set<string>();
  for (let index = 1; index <= 20; index += 1) {
    const value = Deno.env.get(`${baseName}_${index}`)?.trim();
    if (value && !seen.has(value)) { entries.push({ slot: index, value }); seen.add(value); }
  }
  const legacy = Deno.env.get(baseName)?.trim();
  if (legacy && !seen.has(legacy)) entries.push({ slot: 0, value: legacy });
  return entries;
}

export function secretKeys(baseName: string): string[] {
  return secretKeyEntries(baseName).map((entry) => entry.value);
}

export function bearerHeaders(baseName: string, index = 0): Record<string, string> {
  const key = secretKeys(baseName)[index % Math.max(1, secretKeys(baseName).length)];
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export function bearerHeadersForSlot(baseName: string, slot: number): Record<string, string> {
  const key = slot > 0
    ? Deno.env.get(`${baseName}_${slot}`)?.trim()
    : Deno.env.get(baseName)?.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}
