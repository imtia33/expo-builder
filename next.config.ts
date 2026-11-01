import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // react-native-web ships ESM internals that must run through the bundler.
  transpilePackages: ["react-native-web"],
};

export default nextConfig;
