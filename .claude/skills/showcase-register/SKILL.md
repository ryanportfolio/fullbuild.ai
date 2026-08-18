---
description: Publish a shipped prototype into the showcase at /prototype: rewrite, drafts row, and a finale card graded into the set. Use for /showcase-register, "add it to the showcase", "put it in the gallery", or a prototype missing from the index.
---

# showcase-register — put a prototype into the gallery

A prototype is not published until it appears at `/prototype`. Shipping the page and the rewrite leaves it reachable only by direct URL, which is how prototypes go missing for months.

`/prototype` serves the showcase, not the drafts list. There are three separate registrations and all three are required:

| Surface | File | What it is |
|---|---|---|
| Clean URL | `next.config.mjs` | static prototypes only, rewrite to `index.html` |
| Drafts list | `public/prototype/index.html` | the plain numbered list at `/prototype/index.html` |
| The gallery | `src/components/showcase/data.ts` | `PROTOTYPE_INDEX`, the finale grid users actually see |

Input: `register a finished prototype in the fullbuild.ai showcase index` names the prototype. If it is missing, ask which one.

## Step 1: Register the URL and the drafts list

Static prototypes under `public/prototype/<name>/` need a rewrite in `next.config.mjs`, copying the shape of its neighbours:

```
{ source: '/prototype/<name>', destination: '/prototype/<name>/index.html' },
```

Routed prototypes under `src/app/prototype/<name>/` need no rewrite.

Then append a row to the `<ol>` in `public/prototype/index.html`, matching the markup of the last entry exactly (number, `h2`, description paragraph, `tag--platform` and `tag--live` spans). Do not renumber existing rows. Description follows `.claude/reference/voice.md`: no em dashes, and body prose only.

## Step 2: Capture the thumbnail

The finale cards are 608x320 captures, pre-graded, shipped under `public/prototype/showcase/media/index/<name>.webp`. Serve the prototype and photograph it with headless Playwright, never a preview pane.

Frame it so the prototype is recognisable at thumbnail size: capture at a 1.9 ratio viewport large enough to include the signature element, not just the masthead. `1520x800` suits a tall hero; `1216x640` suits a dense one. Wait for `document.fonts.ready`, and freeze any capture hook the prototype ships (`window.__capture.freeze()`) so the frame is deterministic.

## Step 3: Grade it into the family

A raw screenshot will not sit in the field. The shipped captures carry an indigo matrix over a chromatic split, and a new card must carry the same one. Apply with ffmpeg:

```bash
ffmpeg -y -i raw.png -vf "scale=608:320,format=rgb24,geq=r='0.300*r(X+2,Y)+0.216*g(X+2,Y)+0.052*b(X+2,Y)+29.9':g='0.006*r(X,Y)+0.614*g(X,Y)+0.102*b(X,Y)+6.7':b='-0.304*r(X-2,Y)+0.651*g(X-2,Y)+0.422*b(X-2,Y)+56.0'" -quality 82 -compression_level 5 out.webp
```

Red is sampled two pixels right and blue two left; that separation is the fringe, not an artefact. The same constants are recorded in `data.ts` beside `PROTOTYPE_INDEX`.

Do not trust the numbers blindly if the family ever gets re-graded. Re-derive them: capture an existing prototype at the same framing, decode both its raw capture and its shipped `.webp` to `rgb24`, and least-squares fit each output channel against the source R, G, B and a constant. The fit is right when re-deriving a sibling from its raw capture lands within single-digit counts of mean error, against roughly 50 ungraded.

Check the result before shipping: view the `.webp`, and confirm its mean channel values sit inside the family's range.

## Step 4: Add the card

Append to `PROTOTYPE_INDEX` in `src/components/showcase/data.ts`, in the drafts list's order, **before** `prediction-lab` — that slot is deliberately last because it points out of the gallery. No card may point at the showcase itself.

The grid runs five columns per band. Check the arithmetic: an entry count that leaves a partial row hangs an orphan card under it. Give the affected band its own `grid-template-columns` in `showcase.module.css` so each band is whole rows, and say in a comment why the count forced it.

## Step 5: Update the contract tests

`tests/prototype-showcase.test.mjs` pins the card count, the first and last id, the image paths, and the band split. Update those assertions to the new shape and add one for any new column rule. Then run:

```bash
node --test tests/prototype-showcase.test.mjs
```

Also grep the CSS and data comments for a now-stale written-out count ("Fifteen graded captures") and correct it.

## Step 6: Verify on the rendered page

The showcase is a scroll-driven WebGL journey behind an entry gate, and both defeat naive checks:

- Scrolling to the bottom without entering leaves the entry screen painted over the finale. Click the centred entry pill first, then wheel to the end in increments. `section[aria-label="Contact"]` reporting `data-visible="true"` is the signal the finale is really on screen.
- Do not click by text: the header carries a link with the same wording that navigates away. Locate the entry control by its geometry or role first.
- Background pages throttle rAF and IntersectionObserver, so bring the page to the front before screenshotting or reveals never fire.

Confirm in the DOM that the card exists, its image has `naturalWidth > 0`, each band's card count and computed column count are what you intended, and card widths across bands are within a few pixels. Then photograph the finale and look at it.

## Step 7: Ship

Commit the prototype registration, the thumbnail, the data entry, any CSS rule, and the test updates together. Push, open one PR, squash-merge, then confirm the deploy succeeded and check the live finale rather than assuming.

## Anti-patterns

- Don't treat `/prototype/index.html` as the gallery. It is the drafts list; `/prototype` is the showcase.
- Don't drop a raw screenshot into the index media directory. Ungraded, it reads as a foreign object in the field.
- Don't add a chapter to `SHOWCASE_PROJECTS` as part of registering a card. Those nine chapters have evenly spaced centres and per-project motifs and shaders; adding one moves every handover in the sequence and is its own piece of work.
- Don't displace `prediction-lab` from the last slot.
- Don't let a partial row ship. An orphan card under a full row reads as a bug.
- Don't claim the finale renders because the DOM says so. The DOM is laid out long before the journey paints it.
