const EMP_KEYWORDS = /emp|employee/i;
const ID_KEYWORDS = /\bid\b|#|num|number|code/i;

export function detectLegacyEmployeeKey(legacyHeaders: string[]): string {
  const exact = legacyHeaders.find((h) => h.toLowerCase() === "employee id");
  if (exact) return exact;

  const fuzzy = legacyHeaders.find((h) => EMP_KEYWORDS.test(h) && ID_KEYWORDS.test(h));
  if (fuzzy) return fuzzy;

  return "";
}
