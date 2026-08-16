export const HARNESS_SKILL_GROUPS = Object.freeze([
  {
    id: 'core',
    label: 'Core workflows',
    description: 'Setup, memory, maintenance, and everyday project control',
  },
  {
    id: 'discipline',
    label: 'Quality disciplines',
    description: 'Planning, review, and dependable long-form execution',
  },
  {
    id: 'specialist',
    label: 'Specialist tools',
    description: 'Focused modes for design, writing, critique, and delivery',
  },
]);

export const HARNESS_SKILL_CATALOG = Object.freeze([
  {
    name: 'init-project',
    label: 'Initialize project',
    group: 'core',
    required: true,
    description: 'Tune the Harness after adding your framework, scaffold, or first project files',
  },
  {
    name: 'recall',
    label: 'Project memory',
    group: 'core',
    description: 'Read and save durable repository knowledge and pitfalls',
  },
  {
    name: 'addskill',
    label: 'Add skill',
    group: 'core',
    description: 'Install or create repository-local skills for future sessions',
  },
  {
    name: 'sync-starter',
    label: 'Sync starter',
    group: 'core',
    description: 'Pull safe template improvements into an existing project',
  },
  {
    name: 'optimize-context',
    label: 'Optimize context',
    group: 'core',
    description: 'Reduce always-loaded rules, skill indexes, and token weight',
  },
  {
    name: 'refine',
    label: 'Refine workflow',
    group: 'core',
    description: 'Capture friction and improve the operating system after work',
  },
  {
    name: 'merge',
    label: 'Automatic merge mode',
    group: 'core',
    description: 'Explicit session mode for commit, push, pull request, and merge automation',
  },
  {
    name: 'brainstorming',
    label: 'Brainstorming',
    group: 'discipline',
    description: 'Resolve product and architecture choices before implementation',
  },
  {
    name: 'writing-plans',
    label: 'Implementation plans',
    group: 'discipline',
    description: 'Turn an approved design into a detailed executable plan',
  },
  {
    name: 'impartial-review',
    label: 'Impartial review',
    group: 'discipline',
    description: 'Use fresh independent agents to review recent code changes',
  },
  {
    name: 'writing-skills',
    label: 'Skill authoring',
    group: 'discipline',
    description: 'Create, edit, and verify agent skills before deployment',
  },
  {
    name: 'long-horizon',
    label: 'Long horizon',
    group: 'discipline',
    description: 'Run work too large for one context window in verified rounds',
  },
  {
    name: 'fable-mode',
    label: 'Fable mode',
    group: 'specialist',
    description: 'Apply evidence gates to hard, layered, verification-sensitive work',
  },
  {
    name: 'wow-loop',
    label: 'Wow loop',
    group: 'specialist',
    description: 'Run a multi-agent critique loop for high-polish deliverables',
  },
  {
    name: 'lab',
    label: 'Visual lab',
    group: 'specialist',
    description: 'Prototype and tune UI, motion, or game feel before production',
  },
  {
    name: 'advocate',
    label: 'Change advocate',
    group: 'specialist',
    description: 'Challenge a completed change from a fresh independent context',
  },
  {
    name: 'why',
    label: 'Challenge recommendation',
    group: 'specialist',
    description: 'Stress-test the assistant\'s immediately prior recommendation',
  },
  {
    name: 'enhance-prompt',
    label: 'Prompt enhancer',
    group: 'specialist',
    description: 'Rewrite a rough request into a polished prompt for another agent',
  },
  {
    name: 'handoff-audit',
    label: 'Audit handoff',
    group: 'specialist',
    description: 'Create a self-contained prompt for independent verification',
  },
  {
    name: 'humanizer',
    label: 'Humanizer',
    group: 'specialist',
    description: 'Remove machine-made prose patterns before publishing',
  },
  {
    name: 'purposeful-writing',
    label: 'Purposeful writing',
    group: 'specialist',
    description: 'Draft reader-focused emails, essays, reports, and product copy',
  },
  {
    name: 'forge-repo-ui-skill',
    label: 'Forge UI skill',
    group: 'specialist',
    description: 'Synthesize a lean repository-specific frontend design workflow',
  },
  {
    name: 'caveman',
    label: 'Caveman prose',
    group: 'specialist',
    description: 'Compress agent replies while preserving technical accuracy',
  },
]);
