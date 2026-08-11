import { compare, hash } from "bcryptjs";

const bcryptCost = 12;

export const passwordPolicy = Object.freeze({
  minimumLength: 14,
  maximumLength: 128,
  bcryptCost,
});

export async function hashPassword(password: string): Promise<string> {
  if (
    password.length < passwordPolicy.minimumLength ||
    password.length > passwordPolicy.maximumLength
  ) {
    throw new Error("Password must be between 14 and 128 characters");
  }
  return hash(password, bcryptCost);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!password || !passwordHash) return false;
  return compare(password, passwordHash);
}
