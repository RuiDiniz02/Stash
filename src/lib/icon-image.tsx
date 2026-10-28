import { ImageResponse } from "next/og";

/** Renders the Stash app icon as a PNG. `padding` > 0 makes a maskable icon with a safe zone. */
export function renderIcon(size: number, { padding = 0, rounded = true } = {}) {
  const inner = size - padding * 2;
  const unit = inner / 24;
  const bar = (x: number, y: number, w: number, h: number, r: number, opacity: number) => (
    <div
      style={{
        position: "absolute",
        left: padding + x * unit,
        top: padding + y * unit,
        width: w * unit,
        height: h * unit,
        borderRadius: r * unit,
        background: "white",
        opacity,
      }}
    />
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          position: "relative",
          background: "linear-gradient(145deg, #6d5cf6 0%, #4f3fd9 100%)",
          borderRadius: rounded && padding === 0 ? size * 0.225 : 0,
        }}
      >
        {bar(4, 13, 16, 6, 2, 1)}
        {bar(5.5, 8.5, 13, 3.5, 1.5, 0.72)}
        {bar(7, 5, 10, 2.5, 1.25, 0.45)}
      </div>
    ),
    { width: size, height: size },
  );
}
