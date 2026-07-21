import { NextResponse } from 'next/server';

/* ============================================================================
   THE TRANSMITTAL — receiving end of the T-01 countersign sheet.

   Validates the RFI, gates the obvious spam, issues an RFI number for the
   stamp, and delivers the correspondence to hi@fullbuild.ai via Resend's REST
   API (plain fetch, no SDK). Without RESEND_API_KEY in the environment the
   route degrades to the Phase 1 posture: the correspondence lives verbatim in
   the server log and the sheet still stamps TRANSMITTED.

   Spam posture: a honeypot field plus a minimum-time-to-submit gate, no
   CAPTCHA. Trapped submissions are answered exactly like real ones (an RFI
   number, 200 OK) so a bot learns nothing — they are simply never delivered
   or logged as correspondence.
   ========================================================================= */

interface TransmitBody {
  /** The visitor's own email — both the identity and the reply address. */
  from: string;
  message: string;
  /** 'drawn' when the SGN box holds pointer strokes; 'typed:<name>' fallback;
      empty when the visitor left the sheet unsigned (signing is optional). */
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
    return NextResponse.json({ ok: false, error: 'unreadable dispatch' }, { status: 400 });
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
  if (!from || !message) {
    return NextResponse.json({ ok: false, error: 'incomplete dispatch' }, { status: 422 });
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

  // Always in the log, verbatim — the durable copy even when delivery works.
  console.log(
    `[transmit] ${rfi} from=${JSON.stringify(from)} signed=${JSON.stringify(signed)} message=${JSON.stringify(message)}`,
  );

  const key = process.env.RESEND_API_KEY;
  if (key) {
    // Plain-text body only: visitor input never renders as HTML anywhere.
    const text = [
      `${rfi} dispatched via T-01`,
      `From: ${from}`,
      `Signed: ${signed || 'unsigned'}`,
      '',
      message,
    ].join('\n');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.TRANSMIT_FROM ?? 'T-01 Dispatch <dispatch@fullbuild.ai>',
          to: [process.env.TRANSMIT_TO ?? 'hi@fullbuild.ai'],
          reply_to: from,
          subject: `${rfi} · dispatch from ${from}`,
          text,
        }),
      });
      if (!res.ok) {
        console.error(`[transmit] ${rfi} delivery failed: ${res.status} ${await res.text().catch(() => '')}`);
        return NextResponse.json({ ok: false, error: 'delivery line down' }, { status: 502 });
      }
    } catch (err) {
      console.error(`[transmit] ${rfi} delivery failed:`, err);
      return NextResponse.json({ ok: false, error: 'delivery line down' }, { status: 502 });
    }
  } else {
    console.warn(`[transmit] ${rfi} RESEND_API_KEY unset — logged only, no delivery`);
  }

  return NextResponse.json({ ok: true, rfi });
}
