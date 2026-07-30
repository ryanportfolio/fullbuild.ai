import type { Metadata } from "next";
import { ThreadlineApp } from "@/components/threadline/ThreadlineApp";

export const metadata: Metadata = {
  title: "Threadline — Apparel DPC Launch Control",
  description:
    "An interactive apparel launch-readiness prototype connecting PLM, 3D, compliance, and commerce workflows.",
};

export default function ThreadlinePage() {
  return <ThreadlineApp />;
}
