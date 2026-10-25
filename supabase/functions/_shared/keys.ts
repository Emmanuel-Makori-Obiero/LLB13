// Server-only secret helpers. Values are never returned to the client.
export type SecretKeyEntry = { slot: number; value: string };

export function secretKeyEntries(baseName: string): SecretKeyEntry[] {
  const entries: SecretKeyEntry[] = [];
  const seen = new Set<string>();
  for (let index = 1; index <= 20; index += 1) {
    const value = Deno.env.get(`${baseName}_${index}`)?.trim();
    if (value && !seen.has(value)) {
      entries.push({ slot: index, value });
      seen.add(value);
    }
  }
  const legacy = Deno.env.get(baseName)?.trim();
  if (legacy && !seen.has(legacy)) entries.push({ slot: 0, value: legacy });
  return entries;
}

export function newestKeySlotsFirst(entries: readonly SecretKeyEntry[]): SecretKeyEntry[] {
  return [...entries].sort((left, right) => right.slot - left.slot);
}

/** Return every distinct key candidate, rotating the starting slot for later model routes. */
export function failoverKeyCandidates(
  entries: readonly SecretKeyEntry[],
  attemptIndex = 0,
): SecretKeyEntry[] {
  const ordered = newestKeySlotsFirst(entries);
  if (!ordered.length) return [];
  const start = ((Math.trunc(attemptIndex) % ordered.length) + ordered.length) % ordered.length;
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

/** Select exactly one key for this route; successive model routes can advance the cursor. */
export function selectFastFailoverKey(
  entries: readonly SecretKeyEntry[],
  attemptIndex = 0,
): SecretKeyEntry | null {
  const ordered = newestKeySlotsFirst(entries);
  if (!ordered.length) return null;
  const index = ((Math.trunc(attemptIndex) % ordered.length) + ordered.length) % ordered.length;
  return ordered[index] ?? null;
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
