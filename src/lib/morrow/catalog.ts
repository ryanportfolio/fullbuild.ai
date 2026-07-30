import { demoStyles, type GarmentVariant } from "@/lib/threadline/domain";

export type SizeCode = "XS" | "S" | "M" | "L" | "XL";

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductSize {
  code: SizeCode;
  available: boolean;
}

export interface CommerceProduct {
  styleId: string;
  slug: string;
  styleNumber: string;
  name: string;
  category: string;
  variant: GarmentVariant;
  priceCents: number;
  collectionNote: string;
  description: string;
  fit: string;
  materials: string[];
  care: string;
  madeIn: string;
  colors: ProductColor[];
  sizes: ProductSize[];
  merchandisingOrder: number;
}

export interface BagLine {
  id: string;
  productId: string;
  productName: string;
  styleNumber: string;
  color: ProductColor;
  size: SizeCode;
  priceCents: number;
  quantity: number;
}

interface ProductMetadata {
  slug: string;
  priceCents: number;
  collectionNote: string;
  description: string;
  fit: string;
  materials: string[];
  care: string;
  madeIn: string;
  colorNames: string[];
  unavailableSizes: SizeCode[];
  merchandisingOrder: number;
}

const sizeOrder: SizeCode[] = ["XS", "S", "M", "L", "XL"];

const productMetadata: Record<string, ProductMetadata> = {
  "style-transit-shell": {
    slug: "transit-shell",
    priceCents: 29800,
    collectionNote: "Weather layer 01",
    description:
      "A light storm shell cut for movement between exposed platforms, wet streets, and overheated rooms.",
    fit: "Relaxed through the body with articulated sleeves. Take your usual size for layering.",
    materials: ["Recycled nylon face", "Breathable membrane", "Taped internal seams"],
    care: "Machine wash cold. Close all fastenings. Line dry.",
    madeIn: "Cut and sewn in Ho Chi Minh City, Vietnam",
    colorNames: ["Signal vermilion", "Night navy", "Concrete", "Moss"],
    unavailableSizes: ["XS"],
    merchandisingOrder: 1,
  },
  "style-wide-jean": {
    slug: "wide-leg-rinse-jean",
    priceCents: 18800,
    collectionNote: "Denim study 02",
    description:
      "A full-length rinse jean with a clean wide leg and enough structure to hold its line all day.",
    fit: "High rise, close at the waist, easy through the hip, wide from thigh to hem.",
    materials: ["98% regenerative cotton", "2% recycled elastane"],
    care: "Wash inside out in cold water. Hang dry.",
    madeIn: "Cut and sewn in Tehuacán, Mexico",
    colorNames: ["Deep rinse", "Washed indigo", "Ink"],
    unavailableSizes: ["XL"],
    merchandisingOrder: 2,
  },
  "style-rib-polo": {
    slug: "rib-column-polo",
    priceCents: 14800,
    collectionNote: "Fine gauge 03",
    description:
      "A compact rib polo with a long placket and a close, flexible line through the body.",
    fit: "Slim fit with natural stretch. Size up for a straighter silhouette.",
    materials: ["72% merino wool", "28% recycled polyamide"],
    care: "Hand wash cold. Reshape and dry flat.",
    madeIn: "Knitted in Prato, Italy",
    colorNames: ["Rain blue", "Oxide", "Oat"],
    unavailableSizes: ["L"],
    merchandisingOrder: 3,
  },
  "style-fold-messenger": {
    slug: "fold-messenger",
    priceCents: 16800,
    collectionNote: "Carry system 04",
    description:
      "A soft-sided messenger with a folding storm flap, internal device sleeve, and adjustable webbing strap.",
    fit: "One size. Fits a 14-inch laptop and daily essentials.",
    materials: ["Recycled ballistic nylon", "Recycled polyester lining"],
    care: "Wipe clean with a damp cloth.",
    madeIn: "Assembled in Dongguan, China",
    colorNames: ["Carbon", "Clay"],
    unavailableSizes: [],
    merchandisingOrder: 4,
  },
  "style-bias-dress": {
    slug: "bias-slip-dress",
    priceCents: 22800,
    collectionNote: "Evening layer 05",
    description:
      "A fluid bias-cut dress with a clean neckline, narrow straps, and a controlled floor-skimming drape.",
    fit: "Skims the body without compression. Take your usual size.",
    materials: ["82% FSC viscose", "18% recycled acetate"],
    care: "Dry clean only.",
    madeIn: "Cut and sewn in Porto, Portugal",
    colorNames: ["Dust rose", "Black", "Sienna", "Sage", "Bone"],
    unavailableSizes: ["XS", "XL"],
    merchandisingOrder: 5,
  },
  "style-utility-trouser": {
    slug: "pleated-utility-trouser",
    priceCents: 19800,
    collectionNote: "Utility line 06",
    description:
      "A softly structured trouser with double pleats, an adjustable waist, and a straight full-length leg.",
    fit: "Relaxed at the hip with an adjustable waist. Take your usual size.",
    materials: ["Organic cotton twill", "Recycled polyester pocketing"],
    care: "Machine wash cold. Press on low heat.",
    madeIn: "Cut and sewn in Izmir, Türkiye",
    colorNames: ["Lichen", "Sand", "Slate", "Brick"],
    unavailableSizes: ["S"],
    merchandisingOrder: 6,
  },
};

export const commerceProducts: CommerceProduct[] = demoStyles
  .map((style) => {
    const metadata = productMetadata[style.id];
    if (!metadata) {
      throw new Error(`Missing Morrow metadata for ${style.id}`);
    }

    return {
      styleId: style.id,
      slug: metadata.slug,
      styleNumber: style.styleNumber,
      name: style.name,
      category: style.category,
      variant: style.variant,
      priceCents: metadata.priceCents,
      collectionNote: metadata.collectionNote,
      description: metadata.description,
      fit: metadata.fit,
      materials: metadata.materials,
      care: metadata.care,
      madeIn: metadata.madeIn,
      colors: style.swatches.map((hex, index) => ({
        hex,
        name: metadata.colorNames[index] ?? `Color ${index + 1}`,
      })),
      sizes:
        style.variant === "bag"
          ? [{ code: "M" as const, available: true }]
          : sizeOrder.map((code) => ({
              code,
              available: !metadata.unavailableSizes.includes(code),
            })),
      merchandisingOrder: metadata.merchandisingOrder,
    };
  })
  .sort((a, b) => a.merchandisingOrder - b.merchandisingOrder);

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
