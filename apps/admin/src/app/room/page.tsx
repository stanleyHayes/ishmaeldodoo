import type { Metadata } from "next";
import { RoomWorkspace } from "../../components/room/room-workspace";

/**
 * A separate route from the CMS workspace, so decrypted content never shares a
 * bundle or a mounted tree with the editorial surfaces. Never indexed, never
 * cached.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Room",
  robots: { index: false, follow: false },
};

export default function AdminRoomPage() {
  return <RoomWorkspace />;
}
