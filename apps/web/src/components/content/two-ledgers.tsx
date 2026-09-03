"use client";
import type { PublicAtlasNode } from "@amanor/contracts";
import Link from "next/link";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";

export type LedgerView = "diplomatic" | "operator";
export type OperatorSummary = Readonly<{
  institutions: number;
  countries: number;
  outcomes: number;
  portfolios: readonly Readonly<{
    currency: string;
    valueType: "managed" | "raised" | "designed";
    total: number;
    sourceRefs: readonly string[];
  }>[];
}>;
export function operatorSummary(
  items: readonly PublicAtlasNode[],
): OperatorSummary {
  const totals = new Map<
    string,
    {
      currency: string;
      valueType: "managed" | "raised" | "designed";
      total: number;
      sourceRefs: Set<string>;
    }
  >();
  for (const item of items) {
    if (item.portfolioValue === undefined || !item.currency || !item.valueType)
      continue;
    const key = `${item.currency}:${item.valueType}`;
    const current = totals.get(key) ?? {
      currency: item.currency,
      valueType: item.valueType,
      total: 0,
      sourceRefs: new Set<string>(),
    };
    current.total += item.portfolioValue;
    item.sourceRefs.forEach((ref) => current.sourceRefs.add(ref));
    totals.set(key, current);
  }
  return {
    institutions: new Set(items.map((item) => item.institution)).size,
    countries: new Set(items.map((item) => item.country)).size,
    outcomes: items.reduce((total, item) => total + item.outcomes.length, 0),
    portfolios: [...totals.values()].map((item) => ({
      ...item,
      sourceRefs: [...item.sourceRefs],
    })),
  };
}

export function TwoLedgers({
  items,
  locale,
  initialView = "diplomatic",
}: Readonly<{
  items: readonly PublicAtlasNode[];
  locale: SupportedLocale;
  initialView?: LedgerView;
}>) {
  const fr = locale === "fr-FR";
  const [view, setView] = useState<LedgerView>(initialView);
  const summary = operatorSummary(items);
  const sourceRefs = [...new Set(items.flatMap((item) => item.sourceRefs))];
  function choose(next: LedgerView): void {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("ledger", next);
    window.history.replaceState(null, "", url);
    window.localStorage.setItem("amanor-ledger", next);
  }
  function moveTab(
    event: KeyboardEvent<HTMLButtonElement>,
    current: LedgerView,
  ): void {
    let next: LedgerView | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      next = current === "diplomatic" ? "operator" : "diplomatic";
    else if (event.key === "Home") next = "diplomatic";
    else if (event.key === "End") next = "operator";
    if (!next) return;
    event.preventDefault();
    choose(next);
    document.getElementById(`${next}-ledger-tab`)?.focus();
  }
  function printSelectedLedger(): void {
    document.body.classList.add("ledger-print");
    const cleanup = () => {
      document.body.classList.remove("ledger-print");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }
  return (
    <section className="two-ledgers" aria-labelledby="ledgers-heading">
      <div className="two-ledgers__heading">
        <p className="section-number">
          {fr ? "Couche de preuves" : "Evidence layer"}
        </p>
        <h2 id="ledgers-heading">
          {fr
            ? "Deux façons de lire le parcours"
            : "Two ways to read the career"}
        </h2>
        <p>
          {fr
            ? "Passez de l’historique de carrière à un résumé des institutions, pays, résultats et portefeuilles."
            : "Switch between the career history and a summary of institutions, countries, results and portfolio values."}
        </p>
      </div>
      <div className="ledger-toolbar">
        <div
          className="ledger-tabs"
          role="tablist"
          aria-label={fr ? "Choisir un registre" : "Choose a ledger"}
        >
          <button
            id="diplomatic-ledger-tab"
            role="tab"
            aria-label={fr ? "Historique de carrière" : "Career history"}
            aria-selected={view === "diplomatic"}
            aria-controls="diplomatic-ledger"
            tabIndex={view === "diplomatic" ? 0 : -1}
            onClick={() => choose("diplomatic")}
            onKeyDown={(event) => moveTab(event, "diplomatic")}
          >
            <span>{fr ? "Parcours" : "Timeline"}</span>
            {fr ? "Historique de carrière" : "Career history"}
          </button>
          <button
            id="operator-ledger-tab"
            role="tab"
            aria-label={fr ? "Résumé des résultats" : "Results summary"}
            aria-selected={view === "operator"}
            aria-controls="operator-ledger"
            tabIndex={view === "operator" ? 0 : -1}
            onClick={() => choose("operator")}
            onKeyDown={(event) => moveTab(event, "operator")}
          >
            <span>{fr ? "En chiffres" : "By the numbers"}</span>
            {fr ? "Résumé des résultats" : "Results summary"}
          </button>
        </div>
        <button
          type="button"
          className="ledger-print-button"
          onClick={printSelectedLedger}
        >
          {fr ? "Imprimer cette vue" : "Print this view"}
        </button>
      </div>
      {view === "diplomatic" ? (
        <div
          id="diplomatic-ledger"
          role="tabpanel"
          aria-labelledby="diplomatic-ledger-tab"
          className="ledger-sheet"
        >
          <ol>
            {[...items]
              .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
              .map((item) => (
                <li key={item.slug}>
                  <time>
                    {item.startDate.getUTCFullYear()}–
                    {item.endDate?.getUTCFullYear() ??
                      (fr ? "présent" : "present")}
                  </time>
                  <div>
                    <h3>{item.role}</h3>
                    <p>
                      {item.institution} ·{" "}
                      {item.city ?? item.region ?? item.country}
                    </p>
                    <p>{item.outcomes[0]}</p>
                  </div>
                </li>
              ))}
          </ol>
        </div>
      ) : (
        <div
          id="operator-ledger"
          role="tabpanel"
          aria-labelledby="operator-ledger-tab"
          className="ledger-sheet operator-ledger"
        >
          <dl>
            <div>
              <dt>
                {fr ? "Institutions coordonnées" : "Institutions coordinated"}
              </dt>
              <dd>{summary.institutions}</dd>
            </div>
            <div>
              <dt>{fr ? "Pays" : "Countries"}</dt>
              <dd>{summary.countries}</dd>
            </div>
            <div>
              <dt>{fr ? "Résultats vérifiés" : "Verified outcomes"}</dt>
              <dd>{summary.outcomes}</dd>
            </div>
          </dl>
          {summary.portfolios.map((portfolio) => (
            <article key={`${portfolio.currency}-${portfolio.valueType}`}>
              <p>{portfolio.valueType}</p>
              <strong>
                {new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: portfolio.currency,
                  maximumFractionDigits: 0,
                }).format(portfolio.total)}
              </strong>
              <div>
                {portfolio.sourceRefs.map((ref) => (
                  <Link
                    key={ref}
                    href={`${fr ? "/fr" : ""}/record/sources#${ref}`}
                  >
                    {ref}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <section
        className="ledger-print-appendix"
        aria-hidden="true"
        aria-label={fr ? "Annexe des sources" : "Source appendix"}
      >
        <p className="section-number">02</p>
        <h2>{fr ? "Annexe des sources" : "Source appendix"}</h2>
        <p>
          {fr
            ? "Chaque référence renvoie au registre public des sources."
            : "Every reference resolves to the public Source Register."}
        </p>
        <ol>
          {sourceRefs.map((ref) => (
            <li key={ref}>
              <Link href={`${fr ? "/fr" : ""}/record/sources#${ref}`}>
                {ref}
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
