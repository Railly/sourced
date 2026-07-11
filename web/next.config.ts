import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: resolve(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/review-ui": ["../data/sources/ddinter/**/*"],
    "/api/reviews": ["../data/sources/ddinter/**/*"],
  },
  turbopack: {
    root: resolve(__dirname, ".."),
  },
};

export default withEve(nextConfig);
