import type { UIMessage } from "ai";
import type { JobData } from "./types";

/**
 * The thread carries one custom data part: the render job card.
 * Typing it here means both the route and the components fail to compile if the
 * shape drifts.
 */
export type ChatMessage = UIMessage<never, { job: JobData }>;
