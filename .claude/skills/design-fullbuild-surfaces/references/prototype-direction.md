# Opening a new prototype identity

Scope: `public/prototype/<name>/` and `src/app/prototype/<name>/` only. The Working Set, meaning `src/app` outside `src/app/prototype`, is settled and this file does not apply to it.

Each prototype in the corpus deliberately pulls in a different direction: technical-drawing minimalism, neo-brutalist collage, lab-instrument skeuomorphism, cinematic liquid metal, a generated nautical chart. There is no house palette, font or motion doctrine to inherit. What is inherited is the method below plus the always-on rules in `SKILL.md`.

## Confirm before code

Confirm the governing metaphor and the contract header in chat before writing code, as inline markdown ending with "I'll proceed unless you have concerns". Everything after that runs without pausing. Do not run a multi-phase approval ceremony, and do not hide the exploration in private reasoning: the plan in chat is the cheapest correction point.

## 1. Pin the argument

One line each, before any aesthetic decision:

- Subject: what this prototype is about, concretely.
- Reader: who arrives, from where, in what state.
- Job: the one thing this page has to do.

If the brief leaves these open, choose and say what you chose. A prototype that starts as an aesthetic with no argument ends as decoration.

## 2. Derive the identity from the subject's own world

Take palette, materials, type, grid and motion from the subject's own instruments, artifacts and vernacular. That is how the shipped work got its identity: a drawing set produced The Working Set, an oscilloscope rack produced Burn-In, a nautical chart produced Harborline. None started from a mood.

Do not pick from a catalog of named looks. A preset is trend imitation with extra steps, and would have produced none of the five prototypes that exist.

## 3. Refuse the unmotivated default

Name the two or three looks generic AI-generated design is converging on right now, by observation at the time of writing rather than from a list frozen in this file, because such a list decays.

Then test your plan: is this look here because the subject earned it, or because it is where the work drifts by default? A form is only a default when nothing motivated it. Broadsheet columns and hairline rules are exactly what an architectural drawing set and a nautical chart should look like, and both arrived there from the subject. Keep the form, write down what earned it.

## 4. Two gates before building

**Metaphor gate.** State the governing metaphor in one sentence of concrete nouns, then apply the swap test: if the subject were replaced, would the prototype still work? If yes, the metaphor is decoration and the direction is unfinished. Quench collapses if the material is not metal. Burn-In collapses if the subject is not measured. That is the bar.

**Revision gate.** Ask whether this plan is what you would produce for any similar brief. If yes, revise it and write down what changed and why. Three lines of work, and the only mechanical anti-slop step available.

## 5. Deliverable: the contract header

The direction ships as a prose comment at the top of the prototype's stylesheet, before any rule. It is the artifact the audit later reads. It states:

- **Palette**: four to six named values, each with its meaning beside it. One accent per meaning.
- **Type roles**: at least two, with the scale, axis and fitting craft in `type-and-grid.md`. The corpus spine is one variable font (Anybody in Assembly Line and Fault Line, Archivo on the main site, Unbounded in Quench) paired with a monospace measured voice quarantined to real facts. Say for each role whether an axis is animated state or a fixed setting: Assembly Line transitions `font-variation-settings` and drives `wdth` from `--phase-width`, while the main site's label voice is a static `font-stretch: 125%`. Self-host faces under the prototype's own `assets/fonts/`. Never load fonts or libraries from a CDN.
- **Grid and layout concept**, in words, or as plain-text sketch if that is faster.
- **Motion verbs**: two to four, named. The Working Set resolves everything to DRAW, HINGE and POUR. An effect that is not a declared verb does not ship.
- **Ban list**: what this prototype refuses and why. Bans are per prototype, never global. Gradients, blur and glassmorphism are banned on the main site and legitimate inside Burn-In and Quench because those prototypes declared and defended them.
- **Signature element**: one. Boldness is spent in a single place and everything around it stays quiet.
- **The risk**: one real aesthetic risk, named, with the safer alternative it displaced, so the next reader can audit the trade instead of inheriting a mood.

Some existing prototypes carry only a thin token header. When you touch one, reconstruct its contract from its `:root` block, `index.html` and engine, and write the header while you are there.

Match execution to the vision. A maximalist direction needs elaborate execution or it reads thin; a minimal direction needs exact spacing, type and detail or it reads sloppy.

## 6. Storyboard the scroll before writing motion

Nothing currently stands between "the site is an architect's working drawing set" and 627 lines of `DrawingSet.tsx`. For a new prototype, write the storyboard first, as one table:

| Section | Motion verb | Scroll span | Handoff to next | Heading reveal | May add |
|---|---|---|---|---|---|

The last column is the escalation budget: what this section may introduce that the previous one did not. Set a numeric ceiling per screen before building, in terms your prototype actually has (concurrent verbs, stroke count, grid density, layer count), with the failure mode written beside each number so the next author can re-derive it rather than inherit it. Do not import ceilings written for pinned marketing chapters.

The first screen states the governing metaphor in the medium the metaphor lives in, and seeds everything below. It is not a decorated banner.

Vary treatment between adjacent sections, never the system-level rule. Repeating one mark vocabulary on purpose is a strength; The Working Set alternates the drawing side so position encodes pipeline order.

## 7. Earn the rendering stack

Ship the lowest tier that carries the idea. "Could be 3D" is not "should be 3D". CSS plus inline SVG when the metaphor is drawn or typographic (Harborline, Fault Line). Raw WebGL2 with no library for one fullscreen effect or one bespoke renderer (Assembly Line, Burn-In and Quench, each with its own shader architecture). three plus R3F only where there is a real scene graph and postprocessing, which today means only `src/app`.

Pin the exact renderer version when a prototype takes a dependency. Prototypes are zero-build static files by default and three of five carry no animation or scroll library at all; that is a design constraint, not an omission to fix.

Keep a framework-free prototype's reveal layer declarative and tiny: data attributes in the markup plus one small init owning only the `has-js` class and one-shot IntersectionObserver reveals, with no scroll listeners and no canvas awareness. Quench's `reveal.mjs` is 28 lines and that is the target.

## 8. Copy and notes

Copy rules live in `.claude/reference/voice.md`: no em dashes anywhere, no periods on headings or display text, including UI strings inside prototypes. The `humanizer`, `purposeful-writing` and `writing` skills own prose craft; do not restate writing advice here.

Durable findings go to `.claude/reference/` via `/recall save`, which is committed and travels to every machine. Do not start a parallel notes file inside the skill.
