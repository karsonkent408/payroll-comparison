export function assignRole(
  email: string,
): "admin" | "implementor" | "guest" {
  if (email.endsWith('@domain.com')) return 'implementor'
  return 'guest'
}

