/**
 * Turns a provider failure into something a person can act on.
 *
 * The SDK masks errors as "An error occurred." by default, which is the right
 * default and the wrong experience: hitting a free-tier quota is the single most
 * likely failure here, and the user can only fix it if we say so.
 */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/quota|rate.?limit|429|exceeded your current quota/i.test(message)) {
    const retry = message.match(/retry in ([\d.]+)s/i)?.[1];
    return [
      "I've hit the free-tier request limit for the model.",
      retry ? `It frees up in about ${Math.ceil(Number(retry))}s.` : "",
      "You can also paste your own API key in settings to skip the shared quota.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (/api key not valid|unauthenticated|401|403/i.test(message)) {
    return "That API key was rejected by the provider. Check it and try again.";
  }

  if (/timeout|ETIMEDOUT|aborted/i.test(message)) {
    return "The model took too long to respond. Try again.";
  }

  return "Something went wrong talking to the model. Try again.";
}
