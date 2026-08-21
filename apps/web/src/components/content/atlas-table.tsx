import type { PublicAtlasNode } from "@amanor/contracts";
import Link from "next/link";
import { BrandedSelect } from "../ui/branded-select";
import type { SupportedLocale } from "../../lib/i18n/locale";

export type AtlasFilters = Readonly<{
  era?: string;
  institution?: string;
  theme?: string;
  currency?: string;
  scale?: "under-1m" | "1m-100m" | "100m-plus" | "unvalued";
}>;

export function filterAtlasNodes(
  items: readonly PublicAtlasNode[],
  filters: AtlasFilters,
): readonly PublicAtlasNode[] {
  return items.filter((item) => {
    if (filters.era && item.era !== filters.era) return false;
    if (filters.institution && item.institution !== filters.institution)
      return false;
    if (filters.theme && !item.themes.includes(filters.theme)) return false;
    if (filters.currency && item.currency !== filters.currency) return false;
    if (!filters.scale) return true;
    if (filters.scale === "unvalued") return item.portfolioValue === undefined;
    if (!filters.currency || item.portfolioValue === undefined) return false;
    if (filters.scale === "under-1m") return item.portfolioValue < 1_000_000;
    if (filters.scale === "1m-100m")
      return (
        item.portfolioValue >= 1_000_000 && item.portfolioValue < 100_000_000
      );
    return item.portfolioValue >= 100_000_000;
  });
}

export function AtlasTable({
  items,
  locale,
  filters,
  basePath,
}: Readonly<{
  items: readonly PublicAtlasNode[];
  locale: SupportedLocale;
  filters: AtlasFilters;
  basePath: string;
}>) {
  const fr = locale === "fr-FR";
  const eras = [...new Set(items.map((item) => item.era))].sort();
  const institutions = [
    ...new Set(items.map((item) => item.institution)),
  ].sort();
  const themes = [...new Set(items.flatMap((item) => item.themes))].sort();
  const currencies = [
    ...new Set(items.flatMap((item) => (item.currency ? [item.currency] : []))),
  ].sort();
  const filtered = filterAtlasNodes(items, filters);
  return (
    <>
      <form role="search" className="atlas-filters" action={basePath}>
        <BrandedSelect
          name="era"
          label={fr ? "Époque" : "Era"}
          defaultValue={filters.era ?? ""}
          options={[
            { value: "", label: fr ? "Toutes" : "All" },
            ...eras.map((value) => ({ value, label: value })),
          ]}
        />
        <BrandedSelect
          name="institution"
          label="Institution"
          defaultValue={filters.institution ?? ""}
          options={[
            { value: "", label: fr ? "Toutes" : "All" },
            ...institutions.map((value) => ({ value, label: value })),
          ]}
        />
        <BrandedSelect
          name="theme"
          label={fr ? "Thème" : "Theme"}
          defaultValue={filters.theme ?? ""}
          options={[
            { value: "", label: fr ? "Tous" : "All" },
            ...themes.map((value) => ({ value, label: value })),
          ]}
        />
        <BrandedSelect
          name="currency"
          label={fr ? "Devise" : "Currency"}
          defaultValue={filters.currency ?? ""}
          options={[
            { value: "", label: fr ? "Toutes" : "All" },
            ...currencies.map((value) => ({ value, label: value })),
          ]}
        />
        <BrandedSelect
          name="scale"
          label={fr ? "Échelle du portefeuille" : "Portfolio scale"}
          defaultValue={filters.scale ?? ""}
          options={[
            { value: "", label: fr ? "Toutes" : "All" },
            { value: "under-1m", label: "< 1m" },
            { value: "1m-100m", label: "1m–100m" },
            { value: "100m-plus", label: "100m+" },
            {
              value: "unvalued",
              label: fr ? "Sans valeur publiée" : "No published value",
            },
          ]}
        />
        <button>{fr ? "Filtrer" : "Filter"}</button>
        <Link href={basePath}>{fr ? "Effacer" : "Clear"}</Link>
      </form>
      {filters.scale && filters.scale !== "unvalued" && !filters.currency ? (
        <p className="form-note">
          {fr
            ? "Choisissez une devise pour comparer les échelles sans mélanger les monnaies."
            : "Choose a currency to compare scale without mixing currencies."}
        </p>
      ) : null}
      <p aria-live="polite">
        {filtered.length} {fr ? "éléments" : "items"}
      </p>
      <div className="atlas-table-wrap">
        <table>
          <caption>
            {fr
              ? "Parcours publié et vérifié"
              : "Published and verified career record"}
          </caption>
          <thead>
            <tr>
              <th>{fr ? "Période" : "Period"}</th>
              <th>{fr ? "Rôle" : "Role"}</th>
              <th>{fr ? "Lieu" : "Place"}</th>
              <th>{fr ? "Résultats" : "Outcomes"}</th>
              <th>{fr ? "Sources" : "Sources"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.slug}>
                <td>
                  <time>{item.startDate.getUTCFullYear()}</time>–
                  <time>
                    {item.endDate?.getUTCFullYear() ??
                      (fr ? "présent" : "present")}
                  </time>
                </td>
                <td>
                  <strong>{item.role}</strong>
                  <br />
                  {item.institution}
                </td>
                <td>
                  {item.city ? `${item.city}, ` : ""}
                  {item.region ?? item.country}
                </td>
                <td>
                  <ul>
                    {item.outcomes.map((outcome) => (
                      <li key={outcome}>{outcome}</li>
                    ))}
                  </ul>
                  {item.portfolioValue !== undefined ? (
                    <p>
                      {item.currency
                        ? new Intl.NumberFormat(locale, {
                            style: "currency",
                            currency: item.currency,
                          }).format(item.portfolioValue)
                        : item.portfolioValue.toLocaleString(locale)}
                      {item.valueYear ? ` (${item.valueYear})` : ""}
                    </p>
                  ) : null}
                </td>
                <td>
                  {item.sourceRefs.map((ref) => (
                    <Link
                      key={ref}
                      href={`${locale === "fr-FR" ? "/fr" : ""}/record/sources#${ref}`}
                    >
                      {ref}
                    </Link>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
