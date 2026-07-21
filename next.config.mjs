/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM examples; let Next transpile them
  transpilePackages: ['three'],
  // CI/verification can build into an isolated dir so a running dev server's
  // .next is never corrupted mid-session (they otherwise share the directory).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // /prototype pages are static artifacts in public/; map the clean URLs
  // onto their index.html files.
  async rewrites() {
    return [
      { source: '/prototype', destination: '/prototype/index.html' },
      { source: '/prototype/fault-line', destination: '/prototype/fault-line/index.html' },
      { source: '/prototype/assembly-line', destination: '/prototype/assembly-line/index.html' },
    ];
  },
  // Old prototype URLs that have been linked or shipped before the rename.
  async redirects() {
    return [
      { source: '/concept', destination: '/prototype', permanent: true },
      { source: '/concept/time-lapse-manufacture', destination: '/prototype/assembly-line', permanent: true },
      { source: '/prototype/build-seam', destination: '/prototype/fault-line', permanent: true },
    ];
  },
};

export default nextConfig;
