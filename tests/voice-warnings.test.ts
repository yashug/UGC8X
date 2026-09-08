import { describe, expect, it } from "vitest";
import { voiceWarnings } from "@/lib/pipeline/assets";

describe("voiceWarnings", () => {
  it("says nothing when every scene got a voiceover", () => {
    expect(voiceWarnings({ spoken: 5, total: 5 })).toEqual([]);
  });

  it("reports a fully silent video, which is the case that actually shipped", () => {
    expect(
      voiceWarnings({ spoken: 0, total: 5, reason: "the text-to-speech quota is exhausted" }),
    ).toEqual(["This video has no voiceover — the text-to-speech quota is exhausted."]);
  });

  it("reports partial silence, which used to be invisible", () => {
    expect(voiceWarnings({ spoken: 3, total: 5, reason: "text to speech failed" })).toEqual([
      "2 of 5 scenes are silent — text to speech failed.",
    ]);
  });

  it("gets the grammar right for a single silent scene", () => {
    expect(voiceWarnings({ spoken: 4, total: 5 })[0]).toBe("1 of 5 scene is silent.");
  });

  it("still warns when it does not know why", () => {
    expect(voiceWarnings({ spoken: 0, total: 4 })).toEqual(["This video has no voiceover."]);
  });
});
