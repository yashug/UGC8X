/** Shared prop shape between the pipeline and the composition. */
export type RemotionScene = {
  index: number;
  durationSec: number;
  voiceover: string;
  onScreenText: string;
  audioFile: string | null;
  imageFile: string | null;
  videoFile: string | null;
  imageFit: "phone" | "wide" | null;
};

export type UgcVideoProps = {
  productName: string;
  cta: string;
  accentColor: string;
  scenes: RemotionScene[];
  credit?: string;
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const DEFAULT_PROPS: UgcVideoProps = {
  productName: "Your product",
  cta: "Try it today",
  accentColor: "#1f6feb",
  credit: undefined,
  scenes: [
    {
      index: 0,
      durationSec: 4,
      voiceover: "",
      onScreenText: "Add a product URL to begin",
      audioFile: null,
      imageFile: null,
      videoFile: null,
      imageFit: null,
    },
  ],
};
