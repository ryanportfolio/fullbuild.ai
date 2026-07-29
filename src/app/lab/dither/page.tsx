import type { Metadata } from 'next';
import DitherLab from '@/components/lab/DitherLab';

export const metadata: Metadata = {
  title: 'lab · dither',
  robots: { index: false, follow: false },
};

/**
 * LAB — ordered-dither wordmark study. Not linked from the set; a scratch
 * bench for judging whether a Bayer dot/module field suits the cover title.
 */
export default function DitherLabPage() {
  return <DitherLab />;
}
