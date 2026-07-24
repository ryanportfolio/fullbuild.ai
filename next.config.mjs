/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM examples; let Next transpile them
  transpilePackages: ['three'],
  // CI/verification can build into an isolated dir so a running dev server's
  // .next is never corrupted mid-session (they otherwise share the directory).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Rewrite these barrel imports to direct module paths so the client graph
  // only carries the entries actually used.
  experimental: {
    optimizePackageImports: ['@react-three/drei', '@react-three/postprocessing'],
  },
  // /prototype pages are static artifacts in public/; map the clean URLs
  // onto their index.html files.
  async rewrites() {
    return [
      { source: '/prototype', destination: '/prototype/index.html' },
      { source: '/prototype/fault-line', destination: '/prototype/fault-line/index.html' },
      { source: '/prototype/assembly-line', destination: '/prototype/assembly-line/index.html' },
      { source: '/prototype/burn-in', destination: '/prototype/burn-in/index.html' },
      { source: '/prototype/quench', destination: '/prototype/quench/index.html' },
      // Harborline is a static export of a Statamic CMS build: multi-page, so
      // each clean URL maps to its directory's index.html.
      { source: '/prototype/harborline', destination: '/prototype/harborline/index.html' },
      { source: '/prototype/harborline/about', destination: '/prototype/harborline/about/index.html' },
      { source: '/prototype/harborline/contact', destination: '/prototype/harborline/contact/index.html' },
      { source: '/prototype/harborline/lp/fall-winterization', destination: '/prototype/harborline/lp/fall-winterization/index.html' },
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
