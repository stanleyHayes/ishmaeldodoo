import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LivingDossierForm } from "./living-dossier-form";

describe("LivingDossierForm", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("submits the selected live dossier variant in the current locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("%PDF", {
        status: 201,
        headers: { "content-disposition": "attachment; filename=test.pdf" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:test"),
      revokeObjectURL: vi.fn(),
    });
    render(<LivingDossierForm locale="fr-FR" />);
    fireEvent.change(screen.getByLabelText("Votre nom"), {
      target: { value: "Requester" },
    });
    fireEvent.change(screen.getByLabelText("Organisation"), {
      target: { value: "Partner" },
    });
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "person@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Objectif du document"), {
      target: { value: "Briefing institutionnel interne" },
    });
    fireEvent.click(screen.getByLabelText("Dossier institutionnel"));
    fireEvent.click(screen.getByRole("button", { name: "Générer le dossier" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      variant: "institutional",
      locale: "fr-FR",
      organisation: "Partner",
    });
  });
});
