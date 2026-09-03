import { Suspense } from "react";
import { InvitationGateway } from "../components/security/invitation-acceptance";
import { AdminSkeleton } from "../components/ui/admin-state";

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="login-page" aria-busy="true">
          <AdminSkeleton variant="panel" label="Preparing sign in" />
        </main>
      }
    >
      <InvitationGateway />
    </Suspense>
  );
}
