import type { Metadata } from "next";
import { AdminWorkspace } from "../../components/admin-workspace";

/**
 * The shell is one client tree that resolves its own section from the path, so
 * this route exists to make that section addressable: a reload, a bookmark or a
 * pasted link lands here rather than on the overview.
 */
export const metadata: Metadata = {
  title: "Images and Media",
  robots: { index: false, follow: false },
};

export default function AdminMediaPage() {
  return <AdminWorkspace />;
}
