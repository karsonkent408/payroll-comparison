export function normalizeEmployeeKey(key: string | undefined): string {
  if (!key) return "";
  const trimmed = key.trim();
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed.toLowerCase();
}
