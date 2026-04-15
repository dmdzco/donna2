type ClerkErrorEntry = {
  code?: string;
  longMessage?: string;
  message?: string;
  meta?: {
    paramName?: string;
    paramNames?: string[];
  };
};

type ClerkErrorLike = {
  errors?: ClerkErrorEntry[];
};

function isClerkErrorLike(error: unknown): error is ClerkErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    Array.isArray((error as ClerkErrorLike).errors)
  );
}

export function getClerkErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (isClerkErrorLike(error) && error.errors && error.errors.length > 0) {
    return error.errors
      .map(
        (entry) =>
          entry.longMessage || entry.message || entry.code || fallback
      )
      .join("\n");
  }

  return error instanceof Error ? error.message : fallback;
}

export function getClerkFieldErrors(
  error: unknown
): Record<string, string> {
  if (!isClerkErrorLike(error) || !error.errors) {
    return {};
  }

  return error.errors.reduce<Record<string, string>>((acc, entry) => {
    const field = entry.meta?.paramName || entry.meta?.paramNames?.[0];
    const message = entry.longMessage || entry.message || entry.code;

    if (field && message && !acc[field]) {
      acc[field] = message;
    }

    return acc;
  }, {});
}
