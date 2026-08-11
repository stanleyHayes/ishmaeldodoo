export {
  parseAdminEnvironment,
  type AdminDeploymentEnvironment,
  type AdminEnvironment,
} from "../../environment.mjs";
import { parseAdminEnvironment } from "../../environment.mjs";

export function adminApiBaseUrl(): string {
  return parseAdminEnvironment({
    NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV:
      process.env.NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  }).apiBaseUrl;
}
