const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const renderPhaseWorld = (stage, index) => {
  const forms = [
    `<div class="matter matter--fluid"><i></i><i></i><i></i><b>?</b></div>`,
    `<div class="matter matter--planar"><i></i><i></i><b>choose</b><em>align</em></div>`,
    `<div class="matter matter--articulated"><i></i><i></i><i></i><b>build</b><em>test</em></div>`,
    `<div class="matter matter--fused"><i></i><b>release</b><em>proof pending</em></div>`,
  ];

  return `<div class="phase-world phase-world--${stage.id}" data-phase-world="${stage.id}" aria-hidden="true">
    <span class="phase-world__number">0${index + 1}</span>
    ${forms[index]}
    <span class="phase-world__word">${escapeHtml(stage.label)}</span>
  </div>`;
};

const renderStage = (stage, index) => `
  <article class="lifecycle-stage lifecycle-stage--${stage.id}" id="stage-${stage.id}" data-stage-panel="${stage.id}"${stage.locked ? ' data-locked="true"' : ""}>
    <div class="lifecycle-stage__mark" aria-hidden="true">
      <span>0${index + 1}</span>
      <i></i>
    </div>
    <div class="lifecycle-stage__heading">
      <p>${stage.locked ? "gate closed" : "material law"}</p>
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

const renderPlaceholder = (item) => `
  <article class="future-case future-case--${item.form}" data-placeholder-case data-placeholder-form="${item.form}">
    <div class="future-case__object" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div class="future-case__copy">
      <p>${escapeHtml(item.kind)} / ${escapeHtml(item.index)}</p>
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
      <a href="#lifecycle">How it moves</a>
      <a href="#next">Next worlds</a>
    </nav>
    <a class="header-status" href="#exit"><i aria-hidden="true"></i><span>build / </span>${escapeHtml(site.caseStudy.status)}</a>
  </header>

  <main id="main">
    <section class="arrival" id="top" data-build-seam data-phase="${escapeHtml(site.caseStudy.status)}" aria-labelledby="hero-title">
      <div class="phase-worlds">
        ${site.stages.map(renderPhaseWorld).join("")}
      </div>
      <div class="build-seam" aria-hidden="true">
        <span class="build-seam__edge"></span>
        <span class="build-seam__core">full / build / full / build /</span>
      </div>
      <div class="arrival__copy">
        <p class="kicker">${escapeHtml(site.hero.eyebrow)}</p>
        <h1 id="hero-title"><span>From maybe</span><span>to made.</span></h1>
        <p class="arrival__lede">${escapeHtml(site.hero.lede)}</p>
      </div>
      <div class="arrival__promise">
        <p>${escapeHtml(site.brand.tagline)}</p>
        <a href="#case-00">cross the seam <span aria-hidden="true">↓</span></a>
      </div>
      <div class="phase-console" role="group" aria-label="Change lifecycle material">
        ${site.stages.map((stage, index) => `<button type="button" data-phase-control="${stage.id}" data-phase-index="${index}" aria-current="${stage.id === site.caseStudy.status ? "step" : "false"}"${stage.locked ? ' aria-disabled="true"' : ""}><span>0${index + 1}</span>${escapeHtml(stage.label)}</button>`).join("")}
      </div>
      <p class="phase-readout" aria-live="polite"><span>material state</span><strong data-phase-readout>${escapeHtml(site.caseStudy.status)}</strong></p>
    </section>

    <section class="case-zero" id="case-00" aria-labelledby="case-title">
      <div class="case-zero__index" aria-hidden="true"><span>CASE</span>00</div>
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
        <p class="section-label">One intent / four physical laws</p>
        <h2 id="lifecycle-title">Watch uncertainty acquire structure.</h2>
        <p>The object does not change subjects. It changes what it can do.</p>
      </div>
      <div class="lifecycle__stages">
${site.stages.map(renderStage).join("")}
      </div>
    </section>

    <section class="principles" aria-labelledby="principles-title">
      <div class="principles__title">
        <p class="section-label">The operating system</p>
        <h2 id="principles-title">The seam is a test.</h2>
      </div>
      <div class="principles__list">
        ${site.principles.map((item, index) => `<article><span>0${index + 1}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.copy)}</p></article>`).join("")}
      </div>
    </section>

    <section class="next-worlds" id="next" aria-labelledby="next-title">
      <div class="next-worlds__intro">
        <p class="section-label">Future work / no fictional résumé</p>
        <h2 id="next-title">Three empty worlds, already designed.</h2>
        <p>Real work will replace these states without changing their architecture.</p>
      </div>
      <div class="future-cases">
${site.placeholders.map(renderPlaceholder).join("")}
      </div>
    </section>

    <section class="exit" id="exit" aria-labelledby="exit-title">
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
  <noscript><p class="noscript-note">Every case and lifecycle decision remains readable. Motion only changes the material preview above.</p></noscript>
</body>
</html>`;
}
