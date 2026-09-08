import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { Caption } from "./Captions";
import { FPS, type RemotionScene, type UgcVideoProps } from "./schema";

/** Slow push-in. Static footage reads as a slideshow without it. */
function useKenBurns(durationInFrames: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateRight: "clamp",
  });
}

function PhoneFrame({ src, accentColor }: { src: string; accentColor: string }) {
  const { durationInFrames } = useVideoConfig();
  const scale = useKenBurns(durationInFrames);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 15%, ${accentColor}22, #0b0b0d 65%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 720,
          height: 1180,
          borderRadius: 68,
          overflow: "hidden",
          border: "12px solid #17171a",
          boxShadow: "0 60px 120px rgba(0,0,0,0.55)",
          background: "#000",
          transform: `scale(${scale})`,
        }}
      >
        <Img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </AbsoluteFill>
  );
}

/**
 * Landscape art — an og:image, a hero shot — is contained on a tinted ground
 * rather than cropped. Cover-cropping one into the phone frame is what sliced
 * the headline off CalAI's og:image in the first render.
 */
function WideShot({ src, accentColor }: { src: string; accentColor: string }) {
  const { durationInFrames } = useVideoConfig();
  const scale = useKenBurns(durationInFrames);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(130% 80% at 50% 30%, ${accentColor}33, #0b0b0d 70%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: "0 60px",
      }}
    >
      <div
        style={{
          width: "100%",
          borderRadius: 34,
          overflow: "hidden",
          boxShadow: "0 50px 110px rgba(0,0,0,0.55)",
          transform: `scale(${scale})`,
          background: "#fff",
        }}
      >
        <Img src={src} style={{ width: "100%", height: "auto", display: "block" }} />
      </div>
    </AbsoluteFill>
  );
}

function TextCard({
  text,
  accentColor,
}: {
  text: string;
  accentColor: string;
}) {
  const { durationInFrames } = useVideoConfig();
  const scale = useKenBurns(durationInFrames);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${accentColor} 0%, #0b0b0d 78%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: 110,
      }}
    >
      <span
        style={{
          color: "#fff",
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.035em",
          textAlign: "center",
          textWrap: "balance",
          transform: `scale(${scale})`,
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  );
}

function SceneBody({
  scene,
  accentColor,
}: {
  scene: RemotionScene;
  accentColor: string;
}) {
  if (scene.videoFile) {
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <OffthreadVideo
          src={staticFile(scene.videoFile)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }

  if (scene.imageFile) {
    return scene.imageFit === "phone" ? (
      <PhoneFrame src={staticFile(scene.imageFile)} accentColor={accentColor} />
    ) : (
      <WideShot src={staticFile(scene.imageFile)} accentColor={accentColor} />
    );
  }

  // Every visual source failed for this scene, so fall back to type. The video
  // still works; it just looks different.
  return <TextCard text={scene.onScreenText} accentColor={accentColor} />;
}

function Scene({
  scene,
  accentColor,
  showCaption,
}: {
  scene: RemotionScene;
  accentColor: string;
  showCaption: boolean;
}) {
  return (
    <AbsoluteFill>
      <SceneBody scene={scene} accentColor={accentColor} />
      {/* The end card states the CTA itself, so a caption underneath it would
          only collide with it. */}
      {showCaption ? <Caption text={scene.onScreenText} accentColor={accentColor} /> : null}
      {scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}
    </AbsoluteFill>
  );
}

function EndCard({ productName, cta, accentColor }: UgcVideoProps) {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.85) 100%)",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 110,
      }}
    >
      <span style={{ color: "#fff", fontSize: 52, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {productName}
      </span>
      <span
        style={{
          marginTop: 18,
          background: accentColor,
          color: "#fff",
          fontSize: 40,
          fontWeight: 700,
          padding: "18px 38px",
          borderRadius: 999,
        }}
      >
        {cta}
      </span>
    </AbsoluteFill>
  );
}

/** Lay the scenes out on the timeline up front, so nothing mutates during render. */
function layout(scenes: RemotionScene[]) {
  let cursor = 0;
  const placed = scenes.map((scene) => {
    const durationInFrames = Math.max(1, Math.round(scene.durationSec * FPS));
    const from = cursor;
    cursor += durationInFrames;
    return { scene, from, durationInFrames };
  });
  return { placed, totalFrames: cursor };
}

export function UgcVideo(props: UgcVideoProps) {
  const { scenes, accentColor } = props;
  const { placed, totalFrames } = layout(scenes);
  const endCardFrames = Math.round(3.2 * FPS);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0d", fontFamily: "Inter, Helvetica, Arial, sans-serif" }}>
      {placed.map(({ scene, from, durationInFrames }, position) => (
        <Sequence key={scene.index} from={from} durationInFrames={durationInFrames}>
          <Scene
            scene={scene}
            accentColor={accentColor}
            showCaption={position < placed.length - 1}
          />
        </Sequence>
      ))}

      {/* Sits over the final scene rather than taking time of its own. */}
      <Sequence
        from={Math.max(0, totalFrames - endCardFrames)}
        durationInFrames={endCardFrames}
      >
        <EndCard {...props} />
      </Sequence>
    </AbsoluteFill>
  );
}
