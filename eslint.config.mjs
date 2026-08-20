import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next still ships eslintrc-style presets, so FlatCompat bridges
// them into the flat format ESLint 9+ requires (the Next 15 docs' own recipe).
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/', 'node_modules/', '.tmp/', 'public/', '.claude/', '.agents/', 'next-env.d.ts'] },
  ...compat.config({ extends: ['next/core-web-vitals', 'next/typescript'] }),
];

export default config;
