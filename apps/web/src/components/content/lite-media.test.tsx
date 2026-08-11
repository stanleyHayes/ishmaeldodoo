import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiteAudio, LiteImage } from "./lite-media";

describe("Sahel media controls", () => {
  it("renders image alt text without a media request until opted in", () => {
    const { container } = render(
      <LiteImage
        src="https://res.cloudinary.com/example/image/upload/portrait.jpg"
        alt="Approved portrait outdoors"
        width={800}
        height={1000}
        locale="en-GB"
        lite
      />,
    );
    expect(screen.getByText("Approved portrait outdoors")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("shows the pronunciation transcript before loading audio", () => {
    const { container } = render(
      <LiteAudio
        src="https://res.cloudinary.com/example/video/upload/pronunciation.mp3"
        transcript="Ish-ma-el"
        locale="en-GB"
        lite
      />,
    );
    expect(screen.getByText("Ish-ma-el")).toBeInTheDocument();
    expect(container.querySelector("audio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load audio" }));
    expect(container.querySelector("audio")).not.toBeNull();
  });
});
