import {
  audienceDoorLabels,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import type { SupportedLocale } from "../../lib/i18n/locale";

// Shared so the interactive and Lite doors say the same thing in both
// languages, and so a visitor is told what their choice did.
export function audienceDoorsCopy(locale: SupportedLocale) {
  const french = locale === "fr-FR";
  return {
    heading: french
      ? "Que souhaitez-vous trouver ?"
      : "What are you looking for?",
    guidance: french
      ? "Choisissez l’option qui vous ressemble. Nous afficherons d’abord les informations les plus utiles, sans rien masquer."
      : "Choose the option that best describes you. We will show the most useful information first without hiding anything.",
    reset: french ? "Afficher la vue générale" : "Show the general view",
    status(selected: AudienceKey | null): string {
      if (!selected) {
        return french
          ? "Vue générale active. Choisissez une option pour classer les informations ci-dessous."
          : "The general view is showing. Choose an option to order the information below for you.";
      }
      const label = audienceDoorLabels[locale][selected];
      return french
        ? `Vue active : « ${label} » Les informations ci-dessous sont classées pour vous.`
        : `Now showing: “${label}” The information below is ordered for you.`;
    },
    doorAction(active: boolean): string {
      if (active) return french ? "Vue active" : "Now showing";
      return french ? "Afficher ces informations" : "Show this information";
    },
  };
}
