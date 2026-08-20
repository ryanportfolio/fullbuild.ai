import SheetElevation from '@/components/sheets/SheetElevation';
import SheetBlueprint from '@/components/sheets/SheetBlueprint';
import SheetFrame from '@/components/sheets/SheetFrame';
import SheetShipped from '@/components/sheets/SheetShipped';
import SheetDetailTube from '@/components/sheets/SheetDetailTube';
import SheetUnconformity from '@/components/sheets/SheetUnconformity';
import SheetTransmittal from '@/components/sheets/SheetTransmittal';
import DrawingSet from '@/components/motion/DrawingSet';
import IntroMount from '@/components/intro/IntroMount';

/**
 * The working drawing set. Server-rendered as static, SEO-visible HTML/SVG —
 * this FLOOR build is also the exact reduced-motion / no-WebGL spec, so it is
 * never wasted work. <DrawingSet> is a client wrapper that layers the three
 * motion verbs (draw · hinge · pour) and, where the device allows, the WebGL
 * island — pure progressive enhancement over what you see here.
 *
 * <IntroMount> is the opening act, and it changes nothing below it: the overlay is
 * client-only, so it contributes no server HTML, and everything a crawler or a
 * no-JS reader sees is exactly what it was. It gates itself off entirely under
 * reduced motion and on a history-cache restore.
 *
 * It sits OUTSIDE <DrawingSet>, and that is structural rather than stylistic.
 * DrawingSet's <main> carries `perspective`, which makes it the containing block
 * for position:fixed descendants — the same trap its own comment documents for the
 * WebGL backdrop. A fixed overlay nested inside would size to the full document
 * height and scroll away with the page instead of covering the viewport.
 */
export default function Home() {
  return (
    <>
      <IntroMount />
      <DrawingSet>
        <SheetElevation />
        <SheetBlueprint />
        <SheetFrame />
        <SheetShipped />
        {/* the set documents its own construction before the record closes */}
        <SheetDetailTube />
        <SheetUnconformity />
        <SheetTransmittal />
      </DrawingSet>
    </>
  );
}
