# Harness Firmware copy references

Canonical copy authority for Harness Firmware work in this repository. A Desktop mirror exists for convenient reading.

This is the copy authority for the public Harness Firmware story. Read it before writing or revising page copy. When a draft conflicts with this guide, stop and resolve the conflict instead of smoothing it over.

## What the reader should understand

Harness Firmware is the system I built around AI models to make them more effective, safe, reliable, and efficient at software engineering.

AI made code generation cheap. Reliable software still depends on clear planning, relevant project knowledge, controlled permissions, realistic execution, strong verification, independent review, recovery, integration, and human judgment.

The page should leave a reader with four conclusions:

1. AI did meaningful work, but it did not independently engineer the whole product.
2. I understand the engineering process and designed the conditions under which the models work.
3. Repository architecture and reusable skills materially change what an agent can do well.
4. Claims advance through evidence and human authority, not model confidence.

## The central argument

Average agents are more reliable at fixing a clearly reported problem than discovering and preventing failures on their own. Harness Firmware improves the surrounding conditions so models can find more problems, work in bounded slices, verify what they changed, recover from failure, and retain useful lessons.

Repository architecture directly affects agent performance. A repository that makes context, commands, boundaries, tests, rendered checks, review, and recovery easy gives a capable model a better chance of producing good work.

This is the distinction the page must explain:

- Narrow code generation is largely solved.
- End-to-end software engineering still needs a designed system around the model.
- Harness Firmware is that system.

Best central idea:

> The model is one capable component. I engineered the surrounding conditions that bring out its best work.

## Outcomes and the mechanisms behind them

Never publish an outcome word by itself. Show the mechanisms that make the outcome plausible.

| Outcome | Mechanisms actually present |
| --- | --- |
| Efficiency | Thin always-loaded roots, progressive reference and skill loading, bounded one-slice briefs, focused reproductions, filtered command output |
| Quality | Frozen acceptance contract, independent fresh auditor, baseline and treatment comparison, adversarial checks, exact `complete / clean / aligned` gate |
| Safety | Capability preflight, explicit scope, side-effect authority, branch protection, scoped staging, stop-and-ask on user-owned decisions |
| Reliability | Verified-only state, deterministic tests, honest unknowns, latest-main reconciliation, CI and deployment signals reported at their real layer |
| Alignment | Contract never silently rewritten, each brief carries only relevant verified facts, auditor compares work against acceptance |
| Recoverability | Dead-end memory, checkpoints, retained recovery generations, clean rework, repository-backed lessons |
| Portability | Canonical Claude skills, generated Codex adapters, compatibility classifications, runtime-specific tool and authority rules |
| Learning | `recall` stores project facts, `refine` repairs workflow friction, `sync-starter` moves reviewed generic improvements into future repositories |

## Approved hero direction

Use three authored lines with one shared right edge:

> Harness Firmware  
> makes AI  
> better

`better` is deliberately one word because it fills the full measure. Accidental one-word wraps are banned. An authored line is allowed when its scale and width are intentional.

Working supporting copy:

> It loads the right project knowledge, bounds each task, checks real evidence, calls fresh reviewers, and keeps recovery paths when a plan fails. I set the goals, permissions, quality bar, and release decision.

This supporting copy is concrete and directionally correct. Treat it as editable, not permanently locked. Any replacement must preserve the mechanisms and human ownership.

Earlier aligned supporting formulation:

> Reusable skills and repository infrastructure help models load relevant context, work in bounded steps, produce evidence, get fresh review, recover from failures, and carry confirmed lessons into future work.

This remains a useful reference because it explains the system without reducing it to instructions or claiming autonomous engineering.

## The engineering loop

The plain process:

> Clear plan → agent generates code → software runs in a realistic environment → tests or visual checks provide feedback → the change is corrected and shipped

Compact display direction:

> Plan it  
> prove it  
> then ship it

The detailed steps below the heading can carry the full sequence:

1. Plan clearly
2. Build one bounded change
3. Run it where it matters
4. Inspect real evidence
5. Correct, approve, and ship

## Narrative spine: one task earns release

The full page should follow one sanitized task through the system. This is the clearest way to make roles, evidence, failure, recovery, and authority understandable without inventing a category name.

1. Human defines the goal, limits, proof bar, and permissions.
2. The system loads relevant project knowledge and skills.
3. The agent receives one bounded implementation slice.
4. The agent implements it.
5. The software runs under the closest available real conditions.
6. Tests, renders, and inspections produce evidence or an honest `unverified` state.
7. Fresh review checks `complete / clean / aligned` from the files and evidence.
8. Confirmed problems return for repair.
9. Repeated failure records a dead end and changes the approach.
10. Passing work is reconciled with latest main and checked again.
11. A human approves, defers, or ships.
12. Confirmed friction may improve future skills through explicit refinement.

Ordinary readers should be able to follow the task. Technical readers should be able to inspect the mechanism, evidence, skill, tradeoff, and limit behind each stage.

Supporting views may explain repository architecture, responsibility boundaries, or a sanitized proof file. They should support this task story instead of replacing it with a more abstract lead.

## The quality equation

> Plan quality × executor quality × verification quality → output quality

This is a working heuristic, not measured math. A capable executor cannot rescue a fundamentally bad plan. Good code cannot compensate for missing verification.

Core line:

> Code generation is only one term in the equation.

## Copy must explain the mechanism

Every important claim should answer as many of these as the reader needs:

- What changes in the model's working conditions?
- How does it work?
- Why is it useful?
- What evidence does it produce?
- What can still fail?
- Where does human judgment enter?

Lead with the plain mechanism. Add the technical name second when the name helps.

Two editorial tests apply to every panel:

- Does this show what the AI did?
- Does this show what I designed, decided, constrained, or verified?

Every important section should also make the payoff obvious. Explain why the behavior is useful, surprising, efficient, or unusually strong. The interesting part must come from the mechanism.

Good:

> Claude starts Codex CLI with the exact review scope, so a different model can inspect the repository without anyone copying a transcript or diff between tools.

Weak:

> Cross-model review is innovative and powerful.

Weak:

> I design the system that tells AI what to do

Better:

> I built the repository, skills, permission boundaries, checks, and recovery paths that help models work more effectively and make their results easier to verify.

Weak:

> Cross-model verification improves quality

Better:

> Claude selects the exact diff and starts Codex CLI from the working session. Codex reads the repository and diff itself, writes a review file, and Claude verifies each finding before it reaches me.

## Major skills worth explaining

Do not list every skill. Feature the ones that reveal how the system works. Each featured skill needs a plain description, practical benefit, and honest limit.

Use this deep-dive order when the material supports it:

> problem → changed behavior → how it works → why useful → example → limit → source

The example should be sanitized and concrete. The limit prevents architecture from turning into an unsupported performance promise.

### Long Horizon

What it does:

- Freezes the goal and acceptance checks.
- Breaks long work into bounded implementation rounds.
- Gives each round to a fresh executor.
- Gives the result to a fresh auditor that inspects the files and evidence itself.
- Promotes work only after `complete / clean / aligned` verdicts.
- Keeps verified progress, failed approaches, and remaining work in durable state.

Why it helps:

- Long work survives context limits and failed retries.
- Fresh roles reduce shared-story confirmation bias.
- Failed approaches stay visible instead of being rediscovered.
- A passing summary cannot replace direct inspection.

Quality-bar example:

> The auditor rebuilds the evidence map instead of checking someone else's summary. That costs another inspection and buys resistance to shared-context confirmation bias.

Limit:

Fresh inspection costs time. It still depends on available evidence and real agent independence.

### Codex Review

What it does:

1. Claude selects the exact diff.
2. Claude launches Codex CLI programmatically.
3. Codex reads the repository and diff directly.
4. Codex writes a review artifact.
5. Claude verifies every finding.

Why it helps:

- No manual copy and paste between Claude Code and Codex.
- No pasted transcript becomes shared context.
- The reviewer is fresh and comes from another model family.
- The same scoped review can run again without a manual relay.

Limit:

Another model can still be wrong. Every finding needs verification. CLI availability and another model run are real costs.

### Recall

What it does:

Loads a relevant, verified repository lesson when the current task needs it instead of loading every historical note into every turn.

Why it helps:

Known pitfalls remain available without making the standing context noisy and expensive.

Limit:

Retrieving a lesson does not prove the current work followed it.

### Fable Mode

What it does:

Finds the load-bearing unknown, defines what would prove it, gathers evidence, attacks the answer, and reports what remains uncertain.

Why it helps:

One plausible assumption is less likely to corrupt every dependent step.

Limit:

The method creates discipline. It cannot create missing evidence.

### Verify This

What it does:

Turns a confident statement into a falsifiable claim, captures a baseline, applies the change, compares the result, and returns `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE`.

Why it helps:

Confidence stays tied to an observable difference.

Limit:

Missing or confounded evidence returns inconclusive.

### Impartial Review

What it does:

Starts fresh reviewers with the goal and workspace, without the builder's explanation, so they reconstruct the evidence from the files.

Why it helps:

The review is less likely to inherit the builder's story and assumptions.

Limit:

Fresh context does not guarantee a different model family or a correct finding.

### Refine

What it does:

Turns confirmed workflow friction into the smallest reviewed change to project knowledge or a reusable skill.

Why it helps:

Later projects can retrieve a versioned lesson instead of repeating the same failure.

Limit:

Learning is explicit maintenance. Never imply that the system updates itself automatically.

### Caveman Ultra

What it does:

Keeps routine human-facing coordination terse while code, commands, errors, evidence, and safety decisions stay precise.

Why it helps:

It reduces coordination and context cost without weakening technical work.

Limit:

Fewer words do not prove a better engineering result. Efficiency belongs in technical disclosure, not the main story.

## Quality and safety details worth showing

Use concrete process behavior instead of claims such as "safe" or "reliable" by themselves.

- Human-owned goals, tradeoffs, permissions, and release decisions
- Progressive context loading
- Bounded implementation slices
- Realistic runtime and rendered checks
- Deterministic evidence when possible
- Honest reporting when a render, dependency, browser, or release gate is unavailable
- Fresh executors and fresh auditors
- Different-model review through Codex CLI
- Repairs driven by confirmed findings
- `complete / clean / aligned` verdicts
- Latest-main reconciliation before release
- Explicit scope and side-effect authority
- Retained recovery generations
- Dead-end memory and changed approach after repeated failure
- Versioned lessons that feed future work
- Runtime portability across Claude Code and Codex where supported

## Plain public vocabulary

The system may use typed relationships internally. Public labels should use words an ordinary reader understands immediately:

- instructions
- limits
- context
- work
- proof
- review
- repair
- release
- lessons
- permission
- human decision

Terms such as typed edge, control plane, delivery map, executable lineage, and assurance graph may describe internal design mechanics. They should not become the public headline unless the page explains them first and the term adds real precision.

## Quality-bar callouts

These compact lines carry more truth than generic claims about quality:

- Passing tests can still fail acceptance.
- Even the independent reviewer has to show its work.
- Fresh review costs another inspection. That cost resists shared-story bias.
- Missing evidence stays unverified.
- Repeated failure changes the plan.
- Consequential actions stop for human authority.
- Moving main gets its own verification.
- Only confirmed lessons become reusable guidance.
- Recovery preserves progress. It does not pretend failure never happened.

## Evidence language

Use these states consistently:

- Written rule: the repository documents a method or boundary.
- Code-backed check: a script, test, permission, or gate enforces or measures it.
- Seen in audited work: a sanitized process observation was verified in a real project.
- Unresolved: the claim is plausible but the inspected sources do not prove it.

Never turn a process observation into a universal performance claim. Never invent percentages, model-version claims, inventory counts, or outcome metrics.

Numbers belong in a technical disclosure unless the number is essential to the main explanation. Every public number needs an exact repository source and revision. Prefer generated facts over manually copied counts.

## Provenance ownership

Keep source facts and public wording separate:

- Harness Firmware exports deterministic facts from exact committed Git objects.
- fullbuild.ai owns public wording, sanitized examples, and presentation.
- Public surfaces consume registered claims instead of copying literals independently.

For any count, revision, file size, availability claim, or other value that can drift, record:

- claim ID
- evidence class
- source and exact revision
- derivation
- owner
- freshness rule
- public consumers
- limitation

A freshness failure reports unresolved or blocks release according to the claim's importance. It never silently reuses an old value as current.

## Human authority must remain visible

The page must show that technical completion and permission are different things.

Models may plan, edit, run tests, inspect renders, and review changes within their scope. They do not acquire authority because checks passed.

The human owns:

- the goal
- acceptance and tradeoffs
- permission for side effects
- the quality bar
- whether uncertainty is acceptable
- release, publication, deployment, or other shared-system changes

Do not describe human involvement as ceremonial approval at the end. Human judgment shapes the system before, during, and after model work.

## Tone

- Plain language first
- Specific behavior over adjectives
- Explain why a mechanism is useful
- State the tradeoff when it is real
- Confident without pretending uncertainty disappeared
- First person when describing what I designed or decided
- Active verbs and short sentences
- Technical names only after the reader understands the thing

The copy can have personality. It should never sound like a platform sales page or an AI research abstract.

## Rejected wording and patterns

Do not reuse these:

- "Evidence-Gated Delivery Map"
- "engineering control surface"
- "I design the system that tells it what to do"
- "AI writes code / I built the system that makes the work earn trust"
- "The model plans, writes, tests, and reviews one clearly scoped change at a time. I built the repository, skills, permissions, evidence rules, and recovery paths around it."
- Generic "AI does everything" framing
- Brains, sparkles, magic, or autonomous-genius imagery
- Buzzword labels that need a second sentence before they mean anything
- Claims that a skill "ensures," "guarantees," or "solves" quality
- Automatic-learning language for explicit repository maintenance
- Privacy approval for every sanitized process observation
- Efficiency, byte counts, or token savings as the main story

## Display-copy rules

- No accidental one-word line at the end of a heading.
- Authored lines should be sized deliberately, usually to a shared measure.
- Large text should fill its available width.
- Keep the words simple enough to earn the scale.
- Detail belongs below the display line, not inside it.
- No periods on headings or display text.
- No em dashes.
- Do not shrink a heading until it becomes harmless. Rewrite or fit it.

## Page hierarchy

Recommended order:

1. The plain claim: Harness Firmware makes AI better
2. Human, system, model, and proof roles
3. One task moving through the engineering system
4. The compact engineering loop
5. The quality equation and its limit
6. Quality-bar examples and tradeoffs
7. Major skills explained in plain language
8. Technical disclosure for context efficiency, evidence labels, and provenance
9. A large closing idea that restates the system's value without generic marketing

Skill order should follow the story, not a fixed popularity ranking. Long Horizon and Codex Review deserve strong treatment, but they do not have to appear first.

## Internal visual grammar

These meanings may guide the artwork. They are design mechanics, not mandatory public labels.

| Meaning | Treatment |
| --- | --- |
| Context | Document plate with indexed tab |
| Role | Named station with explicit responsibility |
| State | Stacked ledger sheets |
| Candidate work | Open rectangular work packet |
| Evidence | Tagged witness plate naming the evidence type |
| Gate | Bar or diamond with its pass condition written inside |
| Checkpoint | Double border plus revision marker |
| Human authority | Top rail with scoped permission tokens such as `WRITE`, `PUSH`, `MERGE` |
| In flight | Blue open outline with a plain claim label |
| Verified and retained | Green solid route with a verified label |
| Unverified | Empty witness line, dashed border, named missing gate |
| Failed audit | Residue hatch with the explicit three-part verdict |
| Dead end | Persisted state plate with a diagonal strike, never erased |
| Recovery | Backward route into a retained checkpoint |
| Optional path | Dashed connector with its condition written beside it |
| Authority edge | Double-line connector from a human or repository policy |
| On-demand loading | Dotted connector activated only for matching work |

Visual state must encode something real. Color, border, route, and motion cannot be decoration detached from system behavior.

## Structural directions considered

These remain useful internal options:

| Direction | Narrative | Strength | Risk | Best surface |
| --- | --- | --- | --- | --- |
| System relationship graph | Context, roles, work, evidence, authority, state, integration, and learning | Most complete system view. Supports success, failure, and runtime differences | Becomes dense without progressive disclosure | Full Harness page, compact homepage graph |
| Layered responsibility view | Authority, context, execution, assurance, lineage, and learning | Makes responsibilities and boundaries obvious | Rework and stagnation feel abstract | README, presentation, homepage |
| Verified round playback | One sanitized bounded slice, including failure and repair | Concrete and easy to understand under pressure | One example cannot represent the complete architecture | Full Harness page |

Current lead: one task earns release. Relationship and responsibility views support it.

## Homepage and full-page split

Homepage:

- A compact static loop with four or five readable moments
- One visible repair path
- No model versions or manually copied counts
- A direct path into the full explanation

Full Harness page:

- The complete task trace
- Human, model, and repository responsibilities visibly distinct
- Quality heuristic with its limit
- Major skill deep dives
- Sanitized Long Horizon process playback where approved
- Proof, tradeoffs, uncertainty, and limits available without hunting

Phone uses a vertical story. Never shrink the complete desktop graph until its labels become unreadable.

## Copy review checklist

Required write-time rule: use `$claude-starter:unslop` for every public-copy draft and revision. Write clean on the first pass. Run an explicit scan for em dashes before accepting the copy.

Before accepting new copy, ask:

- Does a smart reader understand it on the first pass?
- Does it name a real mechanism?
- Does it explain how the mechanism helps?
- Is the human decision visible?
- Is the evidence or limit honest?
- Is any technical term doing work, or merely sounding impressive?
- Could this sentence describe any AI product? If yes, rewrite it.
- Did an accidental one-word display line appear?
- Is the statement verified by repository evidence?
- Did the draft invent a number, guarantee, or causal claim?
- Did efficiency displace the main engineering story?
- Are the major skills explained, not merely linked?

## Change rule

New copy may improve this guide. It may not silently contradict it. If the user rejects wording or approves a stronger principle, update this file before continuing the page so later sessions inherit the decision.

## Copy change log

Record every public-copy recommendation here before changing the page. Use this exact structure: current copy, proposed copy, reason. Run `$claude-starter:unslop` on the proposal. An explicit user instruction may be marked approved immediately. Other entries remain proposed until the user accepts them or authorizes the implementation pass.

| Status | Current copy | Proposed copy | Why |
| --- | --- | --- | --- |
| Approved by user | `Scroll through one task. The drawing shows who owns each decision, what the model does, what evidence exists, and why work advances or returns.` | Remove | The visual sequence should explain this. The paragraph repeats the interface and weakens the opening frame. |
| Approved by user | `Watch the engineering system work` | Keep the words. Author them as three fitted lines: `Watch the / engineering / system work`. Make `engineering` a constructed visual state. | The meaning stays plain. The treatment makes the key word demonstrate planned, checked work instead of behaving like ordinary emphasis. |
| Approved by user | `Plan it / prove it / then ship it` | `Plan / Prove / Ship` | The shorter words state the loop directly and give each stage enough visual weight to stand on its own. |
| Proposed for local review | `Code generation is only one term in the equation` | `Three things shape the result` | The heading now says exactly what the three-part heuristic explains, without technical phrasing or mathematical throat-clearing. |
| Approved by user | Periods throughout the ten task-detail panels | Remove every period from panel summaries, claims, evidence, sources, and actions, including periods between two statements | These short interface statements read more cleanly as labels and evidence notes without sentence punctuation. Separate statements through layout instead. |
| Approved by user | Natural wrapping inside task-panel summaries | Use authored or measured line grouping with no one-word final line | Prevent weak orphaned endings such as `conditions` while preserving the exact words. |
| Approved by user | The complete `Evidence labels` and `Numbers and provenance` block | Remove the block | The internal claim taxonomy and production-note explanation interrupt the public story and do not earn their space in this experience. |
| Approved by user | The two-column `Fresh context` and `Tradeoff` block inside `Challenge the result` | Remove the block | The panel should focus on the direct cross-model review mechanism instead of pausing for a second explanatory comparison. |
| Proposed for local review | `The same launcher works on Windows and macOS. The web path starts from GitHub.` | `Use a local launcher on Windows, macOS, or Linux. Or create the repo from GitHub.` | The repository has separate local entry points. This names every supported local platform and does not imply one launcher does everything. |
| Proposed for local review | `coding agent runtimes` | `Claude Code and Codex` | The old phrase strands `runtimes` alone on phone. The replacement names the two supported runtimes directly and reads faster. |
| Proposed for local review | `Create the repo and the system together` | `Name the repo and the system together` | The replacement names the first user action and makes the three-step creator sequence concrete. |
| Approved by user | Repeated `Claim / Evidence / Source / Action` grids in all ten task panels | Replace each grid with one stage-specific animated mechanism, one plain explanation of why it helps, and direct links to the exact skill, repository file, or check | The repeated taxonomy exposes internal bookkeeping, makes different mechanisms look identical, and hides the concrete system behavior readers came to understand. |
| Approved by user | `Failed assumptions remain visible` | `Keep the failed path` | The shorter line names the visible recovery behavior and can lead a large animated repair sequence. |
| Approved by user | `Reproduction, patch, matched recheck, dead-end record` | `A confirmed failure is saved before another executor starts` | This explains the sequence instead of listing artifacts without context. |
| Approved by user | `Diff and task ledger` | Direct links labelled `READ LONG HORIZON`, `SEE FABLE MODE`, and `INSPECT PITFALLS.MD` | The reader can inspect the actual methods and repository knowledge behind the behavior. |
| Approved by user | `Loop or escalate without claiming self-healing` | `Change the approach, or stop for a human decision` | This states the real behavior in plain language and keeps human authority visible. |
| Approved by user | No supporting recovery line | `Fresh executors get the confirmed lesson without inheriting the failed conversation` | This explains why retained state and fresh context help without claiming automatic learning. |
| Authorized local implementation | Four small fields under `Define the task` | `A TASK THAT CAN FAIL` plus `The model starts with a target it can miss and limits it cannot cross` | The scene will show the goal, proof bar, limits, and authority becoming one task brief |
| Authorized local implementation | Four small fields under `Load what matters` | `OPEN ONLY WHAT MATCHES` plus `The task opens the few files it needs instead of loading every project note` | The scene will show selective routing into exact repository knowledge |
| Authorized local implementation | Four small fields under `Build one bounded change` | `ONE SLICE · ONE CHECK` plus `Small slices keep the diff inspectable before later work depends on it` | The scene will show a bounded work packet and the next slice waiting behind its check |
| Authorized local implementation | Four small fields under `Run the software` | `CODE MEETS REAL CONDITIONS` plus `The software has to behave outside the explanation that produced it` | The scene will show command, runtime, render, and unavailable conditions separately |
| Authorized local implementation | Four small fields under `Produce proof` | `BASELINE / TREATMENT / VERDICT` plus `A matched comparison can return verified, not verified, or inconclusive` | The scene will show the actual Verify This comparison and its honest result states |
| Authorized local implementation | Existing review explainer plus four small fields under `Challenge the result` | `TWO WAYS TO CHALLENGE THE RESULT` plus `Fresh context checks the work without the builder's explanation; Codex adds a different model without a pasted transcript or copied diff` | The scene will show the programmatic Claude to Codex path and the separate fresh-workspace path |
| Authorized local implementation | Four small fields under `Repair or change approach` | `DEAD END SAVED · ROUTE CHANGED` plus `Fresh executors get the confirmed lesson without inheriting the failed conversation` | The scene will show the failed path retained, the next route changed, and human escalation preserved |
| Authorized local implementation | Four small fields under `Reconcile with latest main` | `OLDER BASE ≠ CURRENT MAIN` plus `Passing evidence can expire when main moves, so the combined state gets checked again` | The scene will show the candidate joining a moving main branch and running another check |
| Authorized local implementation | Four small fields under `Return release to a human` | `PASSING ≠ PERMISSION` plus `Passing checks show technical readiness; a person still decides what may affect shared systems or users` | The scene will show checks stopping at a human-owned release gate |
| Authorized local implementation | Four small fields under `Keep confirmed lessons deliberately` | `FRICTION → REVIEWED REPO CHANGE` plus `Only confirmed friction becomes a reviewed repository change that future work can retrieve` | The scene will show explicit refinement into versioned repository knowledge, never automatic learning |
| Approved by user | No section explains how saved project memory is filtered, audited, and pruned | Add `Save what stays true` after the existing recall demo, with the approved write-versus-read copy, project-direction note, unchanged comparison SVG, advisory audit disclosure, and pinned source links | The current memory story shows a successful save and retrieval. The new second act explains what may be saved, how later reads are counted, how stale or unused entries surface, and why product direction stays active without storing task snapshots. |
| Approved by user | `GOAL + ACCEPTANCE` | `GOAL + PROOF BAR` | Acceptance is process language. Proof bar states that the human defines what the change must demonstrate before it can advance. |
| Approved by user | `Useful friction may become a small reviewed change to project knowledge or a reusable method` | Remove | The animated refinement sequence already shows the progression. The sentence repeats it and competes with the mechanism. |
| Approved by user | `The model provides capability.` | `The model provides capability` | Display headings do not use periods. The two authored lines fit the same measure, with `capability` enlarged to match `The model provides`. |
| Approved by user | `Repeatable methods / that change / how the / work gets done` | `Load the right context / Work in small steps / Check real evidence / Get a fresh review / Recover from failure` | Every fitted line names a real system behavior. Similar line lengths keep the type scale balanced, remove the oversized filler phrase `how the`, and use more of the column beside the system visual. |
| Approved by user | `Load the right context / Work in small steps / Check real evidence / Get a fresh review / Recover from failure` | `Load the right context / Small Steps / Check Evidence / Fresh Review / Failure Recovery` | The shorter labels remove low-value connector words and give the four core mechanisms more visual weight. |
