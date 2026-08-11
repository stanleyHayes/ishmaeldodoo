export const e2eMongoUri =
  "mongodb://amanor_test_admin:amanor_test_admin_password@127.0.0.1:27028/amanor_e2e?authSource=admin&replicaSet=rs0&directConnection=true";
export const e2eRoomMongoUri =
  "mongodb://amanor_room_e2e:amanor_room_e2e_password@127.0.0.1:27028/amanor_room_e2e?authSource=amanor_room_e2e&replicaSet=rs0&directConnection=true";
export const e2eMfaKey = Buffer.alloc(32, 7).toString("base64");
export const e2eMfaSecret = "JBSWY3DPEHPK3PXP";
export const e2ePassword = "amanor-browser-security-passphrase";

export function e2eEmail(browserName: string): string {
  return `security-${browserName}@example.test`;
}

export function e2eEdgeEmail(browserName: string): string {
  return `edge-security-${browserName}@example.test`;
}

export const e2eHardwareKeyEmail = "hardware-key-chromium@example.test";

export function e2eRoleEmail(
  role: "principal" | "desk_officer",
  browserName: string,
): string {
  return `${role.replace("_", "-")}-${browserName}@example.test`;
}

export function e2eRoomPrincipalEmail(browserName: string): string {
  return `room-principal-${browserName}@example.test`;
}

export function e2eRoomDeniedEmail(browserName: string): string {
  return `room-denied-${browserName}@example.test`;
}

export function e2eProtocolReference(browserName: string): string {
  return `PD-2026-${({ chromium: "9101", firefox: "9102", webkit: "9103" } as Record<string, string>)[browserName] ?? "9199"}`;
}
