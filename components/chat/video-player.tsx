"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";

import { UgcVideo } from "@/remotion/UgcVideo";
import { FPS, HEIGHT, WIDTH, type UgcVideoProps } from "@/remotion/schema";

/**
 * The video, assembled in the browser as it plays.
 *
 * Nothing was encoded and nothing is stored: the Player runs the same Remotion
 * composition the server would have rendered, pulling the hook clip and product
 * imagery straight from their original URLs and the voiceover from memory. It
 * appears seconds after the script instead of a minute and a half later.
 */
export function VideoPlayer({ video }: { video: UgcVideoProps }) {
  const durationInFrames = useMemo(
    () =>
      Math.max(
        FPS,
        Math.round(
          video.scenes.reduce((total, scene) => total + scene.durationSec, 0) * FPS,
        ),
      ),
    [video.scenes],
  );

  return (
    <div className="border-t border-line p-3">
      <div className="overflow-hidden rounded-lg bg-black">
        <Player
          component={UgcVideo}
          inputProps={video}
          durationInFrames={durationInFrames}
          fps={FPS}
          compositionWidth={WIDTH}
          compositionHeight={HEIGHT}
          style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
          controls
          doubleClickToFullscreen
          acknowledgeRemotionLicense
        />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-faint">
        Playing live in your browser — nothing was rendered or uploaded.
        {video.credit ? ` Hook footage: ${video.credit}.` : ""}
      </p>
    </div>
  );
}
