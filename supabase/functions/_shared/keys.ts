// Server-only secret helpers. Values are never returned to the client.
export function secretKeys(baseName: string): string[] {
  const values: string[] = [];
  for (let index = 1; index <= 20; index += 1) {
    const value = Deno.env.get(`${baseName}_${index}`)?.trim();
    if (value) values.push(value);
  }
  const legacy = Deno.env.get(baseName)?.trim();
  if (legacy) values.push(legacy);
  return [...new Set(values)];
}

export function bearerHeaders(baseName: string, index = 0): Record<string, string> {
  const key = secretKeys(baseName)[index % Math.max(1, secretKeys(baseName).length)];
  return key ? { Authorization: `Bearer ${key}` } : {};
}
