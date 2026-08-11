import type { LedgerView } from "../../components/content/two-ledgers";
export function ledgerView(
  parameters: Record<string, string | string[] | undefined>,
): LedgerView {
  if (parameters.ledger === "operator" || parameters.audience === "investor")
    return "operator";
  return "diplomatic";
}
