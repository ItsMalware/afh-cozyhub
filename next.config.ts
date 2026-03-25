import type { NextConfig } from "next";

const exportMode = process.env.NEXT_OUTPUT_MODE === "export";

const nextConfig: NextConfig = {
  ...(exportMode ? { output: "export" } : {}),
  // Prevent Turbopack from bundling these native/complex packages —
  // they must be required as-is from node_modules at runtime.
  serverExternalPackages: [
    "firebase-admin",
    "firebase-admin/app",
    "firebase-admin/firestore",
    "firebase-admin/auth",
    "@google-cloud/firestore",
  ],
};

export default nextConfig;
