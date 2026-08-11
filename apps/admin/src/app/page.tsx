import { Suspense } from "react";
import { InvitationGateway } from "../components/security/invitation-acceptance";

export default function AdminPage() {
  return (
    <Suspense fallback={<main className="login-page" aria-busy="true" />}>
      <InvitationGateway />
    </Suspense>
  );
}
