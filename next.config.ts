import type { NextConfig } from "next";
import os from "os";

function collectDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal) origins.add(address.address);
    }
  }

  for (const extra of (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",")) {
    const trimmed = extra.trim();
    if (trimmed) origins.add(trimmed);
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: collectDevOrigins(),
};

export default nextConfig;
