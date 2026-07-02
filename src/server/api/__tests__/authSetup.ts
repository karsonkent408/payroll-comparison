export const TEST_SECRET = "test-secret-for-integration-tests";

export async function signedSessionCookie(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TEST_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return encodeURIComponent(`${token}.${b64}`);
}
