export const DATABASE_UNAVAILABLE_MESSAGE =
  "Our service is temporarily unavailable. Please try again in a few minutes.";

/**
 * Database drivers wrap network errors, so inspect the error and its causes
 * instead of depending on one driver-specific error class.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }

    if (typeof current === "object") {
      const value = current as { message?: unknown; cause?: unknown; code?: unknown };
      if (typeof value.message === "string") messages.push(value.message);
      if (typeof value.code === "string") messages.push(value.code);
      current = value.cause;
      continue;
    }

    break;
  }

  return /\b(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH)\b|connection terminated|connection refused|database.*unavailable/i.test(
    messages.join(" "),
  );
}