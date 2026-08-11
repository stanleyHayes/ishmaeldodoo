import type { Metadata } from "next";
import { RoomChannel } from "../../../../components/room/room-channel";
import { publicMetadata } from "../../../../lib/discoverability/metadata";
import { roomAlternates } from "../../../../lib/room/routes";

/** French half of the reciprocal pair; see `/contact/room`. */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return publicMetadata({
    title: "La Chambre",
    description:
      "Un canal confidentiel et chiffré de bout en bout pour les conversations institutionnelles et d’investissement. Ce n’est pas un canal de marchés publics ou d’appels d’offres.",
    ...roomAlternates("fr-FR"),
    locale: "fr-FR",
    indexable: true,
  });
}

export default function RoomPageFr() {
  return <RoomChannel locale="fr-FR" />;
}
