// Shared readers for `supabase.functions.invoke` failures.
//
// The failure detail an edge function returns lives in the response body, which
// invoke() hands back as `error.context`. That body can only be read once, so
// callers that need the status or the retry hint must go through
// parseFunctionError rather than calling the display wrapper twice.

/**
 * @returns {Promise<{ message: string, status: number|null, retryAfterSeconds: number|null }>}
 */
export async function parseFunctionError(error, fallback) {
  const response = error?.context;
  const status = typeof response?.status === 'number' ? response.status : null;
  let message = error?.message || fallback;
  let retryAfterSeconds = null;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      if (body?.retryAfterSeconds) retryAfterSeconds = body.retryAfterSeconds;
    } catch {
      // Keep the client-side message.
    }
  }
  return { message, status, retryAfterSeconds };
}

/** Thin wrapper for display: the parsed message plus the retry hint if there is one. */
export async function getFunctionErrorMessage(error, fallback) {
  const { message, retryAfterSeconds } = await parseFunctionError(error, fallback);
  return retryAfterSeconds
    ? `${message} Try again in about ${retryAfterSeconds} seconds.`
    : message;
}
