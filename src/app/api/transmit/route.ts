import { NextResponse } from 'next/server';

/* ============================================================================
   THE TRANSMITTAL — receiving end of the T-01 countersign sheet.

   Phase 1 stub: validate the RFI, gate the obvious spam, log the
   correspondence server-side, and issue an RFI number for the stamp. Phase 2
   wires real delivery (Resend outbound + Cloudflare Email Routing for
   hi@fullbuild.ai) once owner credentials exist.

   Spam posture: a honeypot field plus a minimum-time-to-submit gate, no
   CAPTCHA. Trapped submissions are answered exactly like real ones (an RFI
   number, 200 OK) so a bot learns nothing — they are simply never logged as
   correspondence.
   ========================================================================= */

interface TransmitBody {
  /** The visitor's own email — both the identity and the reply address. */
  from: string;
  message: string;
  /** 'drawn' when the SGN box holds pointer strokes; 'typed:<name>' fallback. */
  signed: string;
  /** Honeypot — humans never see the field; any value trips the trap. */
  firm: string;
  /** ms between sheet mount and submit; instant submits are not correspondence. */
  elapsed: number;
}

const MIN_ELAPSED_MS = 4_000;
const LIMITS: Record<string, number> = {
  from: 200,
  message: 4_000,
  signed: 160,
};

function issueRfi(): string {
  // Stub numbering: derived from the clock, zero-padded to the stamp's four
  // digits. Phase 2 replaces this with a durable counter beside real delivery.
  return `RFI-${String(Date.now() % 10_000).padStart(4, '0')}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: TransmitBody;
  try {
    body = (await req.json()) as TransmitBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'unreadable transmittal' }, { status: 400 });
  }

  const field = (k: keyof TransmitBody): string =>
    typeof body[k] === 'string' ? (body[k] as string).trim() : '';

  for (const [k, max] of Object.entries(LIMITS)) {
    if (field(k as keyof TransmitBody).length > max) {
      return NextResponse.json({ ok: false, error: `${k} exceeds sheet` }, { status: 422 });
    }
  }

  const from = field('from');
  const message = field('message');
  const signed = field('signed');
  if (!from || !message || !signed) {
    return NextResponse.json({ ok: false, error: 'incomplete transmittal' }, { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    return NextResponse.json({ ok: false, error: 'from address unreadable' }, { status: 422 });
  }

  const rfi = issueRfi();
  const trapped =
    field('firm').length > 0 ||
    typeof body.elapsed !== 'number' ||
    body.elapsed < MIN_ELAPSED_MS;

  if (trapped) {
    console.log(`[transmit] trapped submission discarded (${rfi})`);
    return NextResponse.json({ ok: true, rfi });
  }

  // Phase 1: the correspondence lives in the server log, verbatim.
  console.log(
    `[transmit] ${rfi} from=${JSON.stringify(from)} signed=${JSON.stringify(signed)} message=${JSON.stringify(message)}`,
  );

  return NextResponse.json({ ok: true, rfi });
}
