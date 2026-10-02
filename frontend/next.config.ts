import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Source map upload needs SENTRY_AUTH_TOKEN — skip silently without it
  silent: true,
  widenClientFileUpload: true,
});
