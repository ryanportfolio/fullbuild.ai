import type { Metadata } from 'next';
import SheetTransmittal from '@/components/sheets/SheetTransmittal';
import DrawingSet from '@/components/motion/DrawingSet';

export const metadata: Metadata = {
  title: 'contact · T-01 transmittal',
  description:
    'Countersign the working set. Sheet T-01 is the transmittal: letter your side of the correspondence and the carriage signs it with you.',
};

/**
 * THE COUNTERSIGN, standalone — the same T-01 sheet the set appends after its
 * appendix, served at /contact for deep links. The full DrawingSet wrapper
 * (minus the WebGL island: no pour on this table) gives it the same motion
 * authority: the form draws under the pen, then the handoff runs exactly as it
 * does at the bottom of the set.
 */
export default function ContactPage() {
  return (
    <DrawingSet island={false}>
      <SheetTransmittal />
    </DrawingSet>
  );
}
