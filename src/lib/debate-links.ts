export function makeDebateInviteUrl(origin: string, shareCode: string): string {
  const code = shareCode.trim().toUpperCase();
  if (!code) throw new Error("A share code is required to create a debate invite.");
  const invite = new URL("/arena", origin);
  invite.searchParams.set("join", code);
  return invite.toString();
}

export function readDebateInviteCode(search: string): string | null {
  const code = new URLSearchParams(search).get("join")?.trim().toUpperCase();
  return code || null;
}
