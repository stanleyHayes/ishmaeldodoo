export const roles = [
  "principal",
  "desk_officer",
  "editor",
  "translator",
  "reviewer",
  "press_officer",
  "trust_admin",
  "security_admin",
] as const;

export type Role = (typeof roles)[number];

const roleSet: ReadonlySet<string> = new Set(roles);

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && roleSet.has(value);
}

export const permissions = [
  "content:read",
  "content:write",
  "content:translate",
  "content:review",
  "content:publish",
  "desk:operate",
  "identity:manage",
  "legacy:manage",
  "press:manage",
  "security:manage",
  /**
   * The Room (F13). Held by the Principal by role, and by at most one designate
   * through an expiring grant checked separately against the Room database.
   * Deliberately absent from `security_admin`: the Security Administrator
   * manages account policy but must never decrypt Room content.
   */
  "room:access",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  principal: new Set(permissions),
  desk_officer: new Set(["content:read", "desk:operate"]),
  editor: new Set(["content:read", "content:write"]),
  translator: new Set(["content:read", "content:translate"]),
  reviewer: new Set(["content:read", "content:review", "content:publish"]),
  press_officer: new Set(["content:read", "press:manage"]),
  trust_admin: new Set(["content:read", "legacy:manage"]),
  security_admin: new Set(["content:read", "security:manage"]),
};

export function hasPermission(
  userRoles: readonly Role[],
  permission: Permission,
): boolean {
  return userRoles.some((role) => rolePermissions[role].has(permission));
}
