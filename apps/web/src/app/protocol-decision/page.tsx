import type { Metadata } from "next";
import { PrincipalDecision } from "../../components/protocol-decision/principal-decision";

export const metadata: Metadata = {
  title: "Protocol decision · Project AMANOR",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ProtocolDecisionPage() {
  return <PrincipalDecision locale="en-GB" />;
}
