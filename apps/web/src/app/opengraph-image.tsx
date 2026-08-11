import { ImageResponse } from "next/og";

export const alt = "Project AMANOR — sourced public record";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#eee9df",
        color: "#102b25",
        display: "flex",
        height: "100%",
        padding: "62px",
        width: "100%",
      }}
    >
      <div
        style={{
          border: "2px solid #102b25",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 7 }}>
          PROJECT AMANOR
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "serif",
            fontSize: 76,
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          A sourced public record.
        </div>
        <div style={{ display: "flex", fontSize: 22 }}>
          Independent authority platform · EN / FR
        </div>
      </div>
    </div>,
    size,
  );
}
