/**
 * One section of Coastwise copy, shared by all four compositions so that the
 * composition is the only variable on the stage.
 */

export const CW = {
  eyebrow: 'COASTWISE / LINE 4',
  headline: 'The coast, on the hour',
  headlineLines: ['The coast,', 'on the hour'],
  lede: 'Nine stops between the harbour and the marsh, every hour from first light to last.',
  primary: 'See the timetable',
  secondary: 'Fares',
  facts: ['9 STOPS', '58 MIN END TO END', '05:40 FIRST OUT'],
  status: 'LIVE',
  board: 'NEXT DEPARTURES',
  ledger: 'DEPARTURE LEDGER',
  rail: 'BELL HARBOUR / SALTMARSH',
  lead: '05:40',
  leadNote: 'FIRST OUT, PLATFORM 2',
} as const;

export const DEPARTURES = [
  { time: '05:40', to: 'SALTMARSH', platform: 'P2', note: 'ON TIME' },
  { time: '06:40', to: 'SALTMARSH', platform: 'P2', note: 'ON TIME' },
  { time: '07:12', to: 'BELL HARBOUR', platform: 'P1', note: 'ON TIME' },
] as const;

export function stamp(route: string): string {
  return `SUBMITTED 07-24 · ROUTE ${route}`;
}
