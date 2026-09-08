import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

/**
 * Anonymous, cookie-backed session. No accounts: it exists only to scope one
 * browser's saved keys to that browser.
 */
export const SESSION_COOKIE = "ugc8x_session";

export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Route handlers may set cookies, so this is safe to call from one. */
export async function ensureSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return id;
}
