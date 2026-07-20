import SheetElevation from '@/components/sheets/SheetElevation';
import SheetBlueprint from '@/components/sheets/SheetBlueprint';
import SheetFrame from '@/components/sheets/SheetFrame';
import SheetShipped from '@/components/sheets/SheetShipped';
import SheetUnconformity from '@/components/sheets/SheetUnconformity';
import DrawingSet from '@/components/motion/DrawingSet';

/**
 * The working drawing set. Server-rendered as static, SEO-visible HTML/SVG —
 * this FLOOR build is also the exact reduced-motion / no-WebGL spec, so it is
 * never wasted work. <DrawingSet> is a client wrapper that layers the three
 * motion verbs (draw · hinge · pour) and, where the device allows, the WebGL
 * island — pure progressive enhancement over what you see here.
 */
export default function Home() {
  return (
    <DrawingSet>
      <SheetElevation />
      <SheetBlueprint />
      <SheetFrame />
      <SheetShipped />
      <SheetUnconformity />
    </DrawingSet>
  );
}
