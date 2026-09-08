import { Composition } from "remotion";

import { UgcVideo } from "./UgcVideo";
import { DEFAULT_PROPS, FPS, HEIGHT, WIDTH, type UgcVideoProps } from "./schema";

export function RemotionRoot() {
  return (
    <Composition
      id="UgcVideo"
      component={UgcVideo}
      durationInFrames={FPS * 25}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={DEFAULT_PROPS}
      // The real length comes from the assembled scenes, which vary per render.
      calculateMetadata={({ props }: { props: UgcVideoProps }) => ({
        durationInFrames: Math.max(
          FPS,
          Math.round(
            props.scenes.reduce((total, scene) => total + scene.durationSec, 0) * FPS,
          ),
        ),
      })}
    />
  );
}
