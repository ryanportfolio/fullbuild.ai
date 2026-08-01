import type { Metadata } from 'next';
import { DeadLowApp } from '@/components/deadlow/DeadLowApp';

export const metadata: Metadata = {
  title: 'Dead Low, guided crossings to Sker Holm',
  description:
    'Guided walks over four miles of seabed to Sker Holm, timed to the minute. Today’s window, the ramp muster, and the turn-back rule.',
};

export default function DeadLowPage() {
  return <DeadLowApp />;
}
