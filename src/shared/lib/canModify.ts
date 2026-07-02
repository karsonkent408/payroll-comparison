type CollaboratorAccess = { userId: string; access: string };

export function canView(
  userRole: string | null,
  userId: string,
  collaborators: CollaboratorAccess[]
): boolean {
  if (userRole === "admin" || userRole === "implementor") return true;
  return collaborators.some((c) => c.userId === userId);
}

export function canModify(
  userRole: string | null,
  userId: string,
  collaborators: CollaboratorAccess[]
): boolean {
  if (userRole === "admin") return true;
  return collaborators.some((c) => c.userId === userId && (c.access === 'editor' || c.access === 'owner'))
}

export function isOwner(
  userRole: string | null,
  userId: string,
  collaborators: CollaboratorAccess[]
): boolean {
  if (userRole === "admin") return true;
  return collaborators.some((c) => c.userId === userId && c.access === 'owner');
}
