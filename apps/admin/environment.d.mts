export type AdminDeploymentEnvironment =
  | "local"
  | "preview"
  | "staging"
  | "production";
export type AdminEnvironment = Readonly<{
  deploymentEnvironment: AdminDeploymentEnvironment;
  apiBaseUrl: string;
  apiOrigin: string;
}>;
export function parseAdminEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): AdminEnvironment;
