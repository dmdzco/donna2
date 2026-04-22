const { expo } = require("./app.json");

function trimmed(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

module.exports = () => ({
  ...expo,
  extra: {
    ...(expo.extra || {}),
    apiUrl: trimmed("EXPO_PUBLIC_API_URL"),
    clerkPublishableKey: trimmed("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    sentryDsn: trimmed("EXPO_PUBLIC_SENTRY_DSN"),
  },
});
