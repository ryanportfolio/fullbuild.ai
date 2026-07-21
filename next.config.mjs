/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM examples; let Next transpile them
  transpilePackages: ['three'],
  // CI/verification can build into an isolated dir so a running dev server's
  // .next is never corrupted mid-session (they otherwise share the directory).
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
