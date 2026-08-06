import type { Metadata } from "next";
import { ShowcaseApp } from "@/components/showcase/ShowcaseApp";

export const metadata: Metadata = {
  title: "Showcase | fullbuild.ai",
  description: "Nine fullbuild prototypes inside one continuous interactive field",
};

export default function ShowcasePage() {
  return <ShowcaseApp />;
}
