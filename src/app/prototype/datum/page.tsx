import type { Metadata } from 'next';
import { DatumApp } from '@/components/datum/DatumApp';

export const metadata: Metadata = {
  title: 'Datum · Coastwise',
  description:
    "Coastwise's brand system, decomposed into checks that answer the moment you change something.",
};

export default function DatumPage() {
  return <DatumApp />;
}
