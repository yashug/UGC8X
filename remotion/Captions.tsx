import { interpolate, useCurrentFrame } from "remotion";

/**
 * Captions are timed from the script we wrote, not from TTS metadata, so they
 * work on every voice provider. A provider that returns word-level timestamps
 * (ElevenLabs, M4+) upgrades this to karaoke without changing the caller.
 */
export function Caption({ text, accentColor }: { text: string; accentColor: string }) {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 8], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fade = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (!text) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 260,
        display: "flex",
        justifyContent: "center",
        padding: "0 70px",
        transform: `translateY(${rise}px)`,
        opacity: fade,
      }}
    >
      <div
        style={{
          background: "rgba(8,8,10,0.82)",
          borderBottom: `6px solid ${accentColor}`,
          borderRadius: 18,
          padding: "22px 34px",
          maxWidth: "100%",
        }}
      >
        <span
          style={{
            color: "#fff",
            fontSize: 62,
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            textAlign: "center",
            display: "block",
            textWrap: "balance",
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
