const WEB_ANALYTICS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";

const webAnalyticsBeacon = (token: string) =>
  ({
    src: `${WEB_ANALYTICS_SCRIPT_ORIGIN}/beacon.min.js`,
    defer: true,
    "data-cf-beacon": JSON.stringify({ token }),
  }) as const;

export { webAnalyticsBeacon };
