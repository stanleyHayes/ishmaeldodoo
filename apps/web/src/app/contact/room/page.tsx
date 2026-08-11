import type { Metadata } from "next";
import { RoomChannel } from "../../../components/room/room-channel";
import { publicMetadata } from "../../../lib/discoverability/metadata";
import { roomAlternates } from "../../../lib/room/routes";

/**
 * P13's confidential half (F13). Unlike the editorial pages, this route does not
 * resolve CMS content: the channel's copy is a security control, so it is
 * reviewed as code and cannot be altered by an editorial account.
 */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return publicMetadata({
    title: "The Room",
    description:
      "A confidential, end-to-end encrypted channel for institutional and investment conversations. Not a procurement or tender channel.",
    ...roomAlternates("en-GB"),
    locale: "en-GB",
    indexable: true,
  });
}

export default function RoomPage() {
  return <RoomChannel locale="en-GB" />;
}
