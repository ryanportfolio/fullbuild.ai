// Fahrzeugmarkt's Spring Boot API. Vercel cannot host a JVM service, so it runs
// on Railway and is proxied under the prototype's own path.
const FAHRZEUGMARKT_API =
  process.env.FAHRZEUGMARKT_API || 'https://api-production-0ece.up.railway.app';

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
      // Harness Firmware product page — a static artifact like the prototypes.
      { source: '/harness-firmware', destination: '/harness-firmware/index.html' },
      { source: '/prototype', destination: '/prototype/index.html' },
      { source: '/prototype/fault-line', destination: '/prototype/fault-line/index.html' },
      { source: '/prototype/assembly-line', destination: '/prototype/assembly-line/index.html' },
      { source: '/prototype/burn-in', destination: '/prototype/burn-in/index.html' },
      { source: '/prototype/quench', destination: '/prototype/quench/index.html' },
      { source: '/prototype/open-saas', destination: '/prototype/open-saas/index.html' },
      { source: '/prototype/maranatha', destination: '/prototype/maranatha/index.html' },
      // Harborline is a static export of a Statamic CMS build. It has a service
      // detail page per entry, so the clean URLs are matched by pattern rather
      // than enumerated: adding a service in the CMS should not need a config
      // change here. This array is the afterFiles group, so real files in
      // public/ (the css, js, svg and woff2) resolve before any of it runs.
      { source: '/prototype/harborline', destination: '/prototype/harborline/index.html' },
      { source: '/prototype/harborline/:path*', destination: '/prototype/harborline/:path*/index.html' },
      // Fahrzeugmarkt is a single-page app with a live backend, not a static
      // export. Its API is proxied here rather than called cross-origin so the
      // session cookie stays first-party; this must precede the SPA fallback
      // below or the fallback would swallow the API calls.
      {
        source: '/prototype/fahrzeugmarkt/api/:path*',
        destination: `${FAHRZEUGMARKT_API}/api/:path*`,
      },
      // Client-side routes fall back to the app shell. Real files in public/
      // resolve before this, so the built assets are unaffected.
      { source: '/prototype/fahrzeugmarkt', destination: '/prototype/fahrzeugmarkt/index.html' },
      {
        source: '/prototype/fahrzeugmarkt/:path*',
        destination: '/prototype/fahrzeugmarkt/index.html',
      },
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
