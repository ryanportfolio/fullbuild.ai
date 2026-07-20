const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const STAGE_SVGS = {
  idea: `<svg viewBox="0 0 120 120" role="img" aria-label="Vapor: uncommitted parts"><g class="svg-vapor"><circle cx="34" cy="48" r="14"/><circle cx="62" cy="30" r="9"/><circle cx="82" cy="58" r="17"/><circle cx="52" cy="76" r="11"/><circle cx="90" cy="86" r="6"/><circle cx="24" cy="84" r="5"/></g></svg>`,
  design: `<svg viewBox="0 0 120 120" role="img" aria-label="Blueprint: measured planes"><g class="svg-blueprint"><rect x="18" y="30" width="52" height="60"/><rect x="52" y="18" width="50" height="44"/><path d="M18 50h52M18 70h52M38 30v60M56 30v60M70 30v60M52 40h50M52 60h50M78 18v44"/><path d="M18 96l84-84" class="svg-accent"/></g></svg>`,
  engineering: `<svg viewBox="0 0 120 120" role="img" aria-label="Machine: articulated assembly"><g class="svg-machine"><path d="M60 22 92 40v34L60 96 28 74V40Z"/><path d="M60 22v74M28 40l64 34M92 40 28 74"/><circle cx="60" cy="59" r="10" class="svg-accent"/><circle cx="60" cy="22" r="4"/><circle cx="92" cy="40" r="4"/><circle cx="28" cy="40" r="4"/><circle cx="60" cy="96" r="4"/><circle cx="92" cy="74" r="4"/><circle cx="28" cy="74" r="4"/></g></svg>`,
  shipped: `<svg viewBox="0 0 120 120" role="img" aria-label="Fused: sealed crate"><g class="svg-fused"><rect x="24" y="28" width="72" height="66" rx="10"/><path d="M24 48h72M60 28v66" class="svg-accent"/><rect x="46" y="52" width="28" height="14" rx="3" class="svg-stamp"/></g></svg>`,
};

const STAGE_MATERIALS = {
  idea: "vapor — unformed",
  design: "blueprint — measured planes",
  engineering: "machine — articulated assembly",
  shipped: "fused — sealed crate",
};

const renderStage = (stage, index) => `
    <article class="lifecycle-stage lifecycle-stage--${stage.id}" id="stage-${stage.id}" data-stage-panel="${stage.id}"${stage.locked ? ' data-locked="true"' : ""}>
      <div class="lifecycle-stage__figure" aria-hidden="true">${STAGE_SVGS[stage.id]}</div>
      <div class="lifecycle-stage__heading">
        <p>t+0${index + 1} / ${stage.locked ? "gate closed" : "manufacture state"} · ${STAGE_MATERIALS[stage.id]}</p>
        <h3>${escapeHtml(stage.label)}</h3>
      </div>
      <div class="lifecycle-stage__body">
        <p class="stage-artifact">${escapeHtml(stage.artifact)}</p>
        <dl>
          <div><dt>decision</dt><dd>${escapeHtml(stage.decision)}</dd></div>
          <div><dt>constraint</dt><dd>${escapeHtml(stage.constraint)}</dd></div>
          <div><dt>verification</dt><dd>${escapeHtml(stage.verification)}</dd></div>
        </dl>
        <a href="/${escapeHtml(stage.evidence)}">open source <span aria-hidden="true">↗</span></a>
      </div>
    </article>`;

const renderTimeControl = (stage, index, currentStatus) => {
  const label = `<span>t+0${index + 1}</span>${escapeHtml(stage.label)}`;
  const current = stage.id === currentStatus ? "step" : "false";
  if (stage.locked) {
    return `<a class="time-control time-control--locked" data-time-control="${stage.id}" data-phase-index="${index}" role="button" tabindex="0" aria-disabled="true" aria-current="${current}">${label}<em>gate</em></a>`;
  }
  return `<a class="time-control" href="#stage-${stage.id}" data-time-control="${stage.id}" data-phase-index="${index}" aria-current="${current}">${label}</a>`;
};

const PLACEHOLDER_SVGS = {
  scaffold: `<svg viewBox="0 0 160 200" aria-hidden="true"><g class="svg-scaffold"><path d="M30 180V40L80 20l50 20v140M30 40l50 20 50-20M30 100h100M30 140h100M80 20v160" stroke-dasharray="7 6"/><path d="M30 180h100" class="svg-accent"/><circle cx="80" cy="60" r="5" class="svg-accent"/><path d="M80 65v30" class="svg-accent"/><path d="M66 95h28" class="svg-accent" stroke-dasharray="4 4"/></g></svg>`,
  blueprint: `<svg viewBox="0 0 200 160" aria-hidden="true"><g class="svg-blueprint-case"><path d="M20 130 70 30l60 14 50 86Z"/><path d="M70 30v100M130 44v86M20 130h160"/><path d="M45 100h50M52 80h50M100 110h56" class="svg-accent"/><circle cx="70" cy="30" r="4" class="svg-accent"/></g></svg>`,
  tray: `<svg viewBox="0 0 200 160" aria-hidden="true"><g class="svg-tray"><path d="M20 130h160l-14 16H34Z"/><rect x="34" y="96" width="26" height="26" transform="rotate(-8 47 109)"/><circle cx="92" cy="104" r="15"/><path d="M126 92l22 12-10 20-22-12Z"/><path d="M160 100l12 22" class="svg-accent"/><circle cx="166" cy="96" r="5" class="svg-accent"/><path d="M40 78l14-16M88 72l4-20M132 76l16-14" stroke-dasharray="3 5"/></g></svg>`,
};

const renderPlaceholder = (item) => `
    <article class="future-case future-case--${item.form}" data-placeholder-case data-placeholder-form="${item.form}">
      <div class="future-case__object" aria-hidden="true">${PLACEHOLDER_SVGS[item.form]}</div>
      <div class="future-case__copy">
        <p>${escapeHtml(item.kind)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.purpose)}</p>
        <p class="future-case__missing">${escapeHtml(item.missing)}</p>
      </div>
    </article>`;

export function renderPage(site) {
  const embedded = JSON.stringify(site).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en" data-case-status="${site.caseStudy.status}" data-deployment-verified="${site.deployment.verified}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(site.caseStudy.summary)}">
  <meta name="theme-color" content="#F3F0E8">
  <title>${escapeHtml(site.brand.name)} — ${escapeHtml(site.brand.tagline)}</title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/src/styles.css">
  <script type="module" src="/src/app.mjs"></script>
</head>
<body>
  <a class="skip-link" href="#main">skip to the work</a>
  <header class="site-header">
    <a class="wordmark" href="#top" aria-label="fullbuild.ai, back to top">${escapeHtml(site.brand.name)}</a>
    <nav aria-label="Primary">
      <a href="#case-00">Case 00</a>
      <a href="#lifecycle">The manufacture</a>
      <a href="#next">Next worlds</a>
    </nav>
    <a class="header-status" href="#exit"><i aria-hidden="true"></i><span>build / </span>${escapeHtml(site.caseStudy.status)}</a>
  </header>

  <main id="main">
    <section class="arrival" id="top" data-manufacture data-phase="${escapeHtml(site.caseStudy.status)}" aria-labelledby="hero-title">
      <canvas class="workshop-canvas" data-workshop-canvas aria-hidden="true"></canvas>
      <div class="arrival__fallback" data-artifact-fallback aria-hidden="true">${STAGE_SVGS[site.caseStudy.status] ?? STAGE_SVGS.engineering}</div>
      <div class="arrival__copy">
        <p class="kicker">${escapeHtml(site.hero.eyebrow)}</p>
        <h1 id="hero-title"><span class="h1-maybe">From maybe</span><span class="h1-made">to made.</span></h1>
        <p class="arrival__lede">${escapeHtml(site.hero.lede)}</p>
      </div>
      <div class="arrival__note" aria-hidden="true">
        <p>scroll = time. drag the artifact. every vertex seeded, nothing improvised.</p>
      </div>
      <div class="arrival__promise">
        <p>${escapeHtml(site.brand.tagline)}</p>
        <a href="#case-00">watch it become real <span aria-hidden="true">↓</span></a>
      </div>
      <div class="time-console" role="group" aria-label="Travel through build time">
        ${site.stages.map((stage, index) => renderTimeControl(stage, index, site.caseStudy.status)).join("")}
      </div>
      <p class="time-readout" aria-live="polite"><span>build time</span><strong data-time-readout>${escapeHtml(site.caseStudy.status)}</strong></p>
    </section>

    <section class="case-zero" id="case-00" aria-labelledby="case-title">
      <div class="case-zero__index" aria-hidden="true">${escapeHtml(site.caseStudy.id)}</div>
      <div class="case-zero__copy">
        <p class="section-label">Current build / honest evidence</p>
        <h2 id="case-title">${escapeHtml(site.caseStudy.title)}</h2>
        <p>${escapeHtml(site.caseStudy.summary)}</p>
      </div>
      <div class="case-zero__receipt">
        <p><span>brief</span>portfolio for complete product creation</p>
        <p><span>state</span>${escapeHtml(site.caseStudy.status)} / local build</p>
        <p><span>promise</span>one person, no handoff gap</p>
        <p><span>ship gate</span>${escapeHtml(site.stages.at(-1).verification)}</p>
      </div>
    </section>

    <section class="lifecycle" id="lifecycle" aria-labelledby="lifecycle-title">
      <div class="lifecycle__intro">
        <p class="section-label">One artifact / four manufacture states</p>
        <h2 id="lifecycle-title">Scroll through the build itself.</h2>
        <p>Time runs forward as you descend. The object does not change subjects — it changes what it can do.</p>
      </div>
      <div class="lifecycle__track" data-lifecycle-track>
        <div class="lifecycle__sticky">
          <p class="lifecycle__clock" aria-hidden="true"><span>build time</span><strong data-lifecycle-clock>t+3.00</strong></p>
          <div class="lifecycle__panels">
${site.stages.map(renderStage).join("")}
          </div>
        </div>
      </div>
    </section>

    <section class="principles" aria-labelledby="principles-title">
      <div class="principles__title">
        <p class="section-label">Shop rules</p>
        <h2 id="principles-title">The house contract.</h2>
      </div>
      <div class="principles__list">
        ${site.principles.map((item) => `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.copy)}</p></article>`).join("")}
      </div>
    </section>

    <section class="next-worlds" id="next" aria-labelledby="next-title">
      <div class="next-worlds__intro">
        <p class="section-label">Future work / no fictional résumé</p>
        <h2 id="next-title">Three artifacts, not yet built.</h2>
        <p>Real work will take these places without changing the architecture around them.</p>
      </div>
      <div class="future-cases">
${site.placeholders.map(renderPlaceholder).join("")}
      </div>
    </section>

    <section class="exit" id="exit" aria-labelledby="exit-title">
      <div class="exit__pedestal" aria-hidden="true"><i></i><span>pedestal empty — next artifact pending</span></div>
      <p class="section-label">The next unresolved thing</p>
      <h2 id="exit-title">${escapeHtml(site.exit.title)}</h2>
      <div class="exit__gate">
        <p>${escapeHtml(site.exit.contact)}</p>
        <span>${escapeHtml(site.exit.note)}</span>
      </div>
      <p class="exit__tagline">${escapeHtml(site.brand.tagline)}</p>
      <p class="exit__wordmark">${escapeHtml(site.brand.name)}</p>
    </section>
  </main>

  <script id="site-data" type="application/json">${embedded}</script>
  <noscript><p class="noscript-note">Every case, manufacture state, and decision remains readable below. Motion only drives the artifact preview.</p></noscript>
</body>
</html>`;
}
