import {
  authenticationMethods,
  type AuthenticationMethod,
} from "@amanor/contracts";

const authenticationMethodSet: ReadonlySet<string> = new Set(
  authenticationMethods,
);

export { authenticationMethods, type AuthenticationMethod };

export function isAuthenticationMethod(
  value: unknown,
): value is AuthenticationMethod {
  return typeof value === "string" && authenticationMethodSet.has(value);
}

export function authenticationMethodListIsValid(
  value: unknown,
): value is readonly AuthenticationMethod[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= authenticationMethods.length &&
    value.every(isAuthenticationMethod) &&
    new Set(value).size === value.length
  );
}
