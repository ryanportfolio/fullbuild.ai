import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Threadline is discoverable and exposes its complete product contract', async () => {
  const [directory, page, app, styles] = await Promise.all([
    read('public/prototype/index.html'),
    read('src/app/prototype/threadline/page.tsx'),
    read('src/components/threadline/ThreadlineApp.tsx'),
    read('src/app/prototype/threadline/threadline.module.css'),
  ]);

  assert.equal((directory.match(/href="\/prototype\/threadline"/g) ?? []).length, 1);
  assert.match(directory, /<span class="num">08<\/span>[\s\S]*?<h2>Threadline<\/h2>/);
  assert.match(directory, /React \+ Spring Boot/);
  assert.match(page, /Threadline — Apparel DPC Launch Control/);

  for (const contract of [
    'THREADLINE',
    'SIMULATED DATA',
    'Exception queue',
    'Collection readiness',
    'Integration pulse',
    'System map',
    'aria-live',
    'Reset demo',
  ]) {
    assert.match(app, new RegExp(contract));
  }

  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 620px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|backdrop-filter/);
});

test('Threadline ships an inspectable full-stack and GitOps reference', async () => {
  const required = [
    'showcase/threadline/README.md',
    'showcase/threadline/backend/pom.xml',
    'showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/ThreadlineApplication.java',
    'showcase/threadline/backend/src/main/resources/db/migration/postgresql/V1__baseline.sql',
    'showcase/threadline/infra/Dockerfile',
    'showcase/threadline/infra/k8s/base/deployment.yaml',
    'showcase/threadline/infra/argocd/application.yaml',
    '.github/workflows/threadline-ci.yml',
  ];

  await Promise.all(required.map((path) => access(new URL(`../${path}`, import.meta.url))));

  const [deployment, argocd, workflow, readme, security, configuration] = await Promise.all([
    read('showcase/threadline/infra/k8s/base/deployment.yaml'),
    read('showcase/threadline/infra/argocd/application.yaml'),
    read('.github/workflows/threadline-ci.yml'),
    read('showcase/threadline/README.md'),
    read('showcase/threadline/backend/src/main/java/ai/fullbuild/threadline/config/SecurityConfiguration.java'),
    read('showcase/threadline/backend/src/main/resources/application.yml'),
  ]);

  assert.match(deployment, /runAsNonRoot:\s*true/);
  assert.match(deployment, /readOnlyRootFilesystem:\s*true/);
  assert.match(deployment, /allowPrivilegeEscalation:\s*false/);
  assert.match(argocd, /selfHeal:\s*true/);
  assert.match(argocd, /prune:\s*true/);
  assert.match(workflow, /mvn --batch-mode verify/);
  assert.match(workflow, /actions\/setup-java@v5/);
  assert.match(security, /SCOPE_integrations\.read/);
  assert.match(security, /SCOPE_integrations\.write/);
  assert.match(security, /SCOPE_readiness\.write/);
  assert.match(configuration, /locations:\s*classpath:db\/migration\/mssql/);
  assert.match(readme, /\/api\/v1\/integrations\/\{source\}\/events/);
  assert.match(readme, /Verified locally/);
  assert.match(readme, /Not claimed/);
});
