"use client";

import { Garment } from "@/components/threadline/Garment";
import type { GarmentVariant } from "@/lib/threadline/domain";

interface ProductSilhouetteProps {
  className?: string;
  color: string;
  name: string;
  rotation?: number;
  variant: GarmentVariant;
}

type ProductVisualStyle = React.CSSProperties & {
  "--product-color": string;
  "--product-rotation": string;
};

export function ProductSilhouette({
  className,
  color,
  name,
  rotation = 0,
  variant,
}: ProductSilhouetteProps) {
  return (
    <div
      className={className}
      style={
        {
          "--product-color": color,
          "--product-rotation": `${rotation}deg`,
        } as ProductVisualStyle
      }
    >
      <Garment variant={variant} status="ready" name={name} />
    </div>
  );
}

