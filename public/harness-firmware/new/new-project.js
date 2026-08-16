import { HARNESS_SKILL_CATALOG, HARNESS_SKILL_GROUPS } from './skill-catalog.js';

const connection = document.querySelector('#connection');
const form = document.querySelector('#github-form');
const fallback = document.querySelector('#fallback');
const connectButton = document.querySelector('#connect-button');
const templateButton = document.querySelector('#template-button');
const accountChoice = document.querySelector('#account-choice');
const accountSelect = document.querySelector('#github-account');
const errorBox = document.querySelector('#creator-error');
const createButton = document.querySelector('#create-button');
const disconnectButton = document.querySelector('#disconnect-button');
const success = document.querySelector('#success');
const creatorPanel = document.querySelector('.creator-panel');
const skillTrigger = document.querySelector('#skill-trigger');
const skillCount = document.querySelector('#skill-count');
const skillPicker = document.querySelector('#skill-picker');
const skillGroups = document.querySelector('#skill-groups');
const skillPickerCount = document.querySelector('#skill-picker-count');
const skillPickerClose = document.querySelector('#skill-picker-close');
const skillsEnableAll = document.querySelector('#skills-enable-all');
const skillsClearOptional = document.querySelector('#skills-clear-optional');
const skillsDone = document.querySelector('#skills-done');
const successSummary = document.querySelector('#success-summary');
const successWarning = document.querySelector('#success-warning');

const skillState = new Map(HARNESS_SKILL_CATALOG.map((skill) => [skill.name, true]));
let isCreating = false;

function setConnection(title, copy, connected = false) {
  connection.classList.toggle('connected', connected);
  connection.querySelector('strong').textContent = title;
  connection.querySelector('p').textContent = copy;
}

function showCreatorForm() {
  fallback.hidden = true;
  form.hidden = false;
  skillTrigger.hidden = false;
  skillTrigger.disabled = false;
}

function enabledSkillCount() {
  return [...skillState.values()].filter(Boolean).length;
}

function selectedDisabledSkills() {
  return HARNESS_SKILL_CATALOG
    .filter((skill) => !skillState.get(skill.name))
    .map((skill) => skill.name);
}

function updateSkillCounts() {
  const enabled = enabledSkillCount();
  skillCount.textContent = `${enabled} enabled`;
  skillTrigger.setAttribute('aria-label', `Customize skills, ${enabled} enabled`);
  skillPickerCount.textContent = `${enabled} skills enabled`;
  if (!isCreating) createButton.querySelector('span').textContent = `Create with ${enabled} skills`;

  for (const group of HARNESS_SKILL_GROUPS) {
    const groupSkills = HARNESS_SKILL_CATALOG.filter((skill) => skill.group === group.id);
    const groupEnabled = groupSkills.filter((skill) => skillState.get(skill.name)).length;
    const output = skillGroups.querySelector(`[data-group-count="${group.id}"]`);
    if (output) output.textContent = `${groupEnabled}/${groupSkills.length} on`;
  }
}

function skillOption(skill) {
  const option = document.createElement('label');
  option.className = 'skill-option is-enabled';
  if (skill.required) option.classList.add('is-required');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  input.disabled = skill.required === true;
  input.dataset.skillName = skill.name;
  input.setAttribute('aria-describedby', `skill-description-${skill.name}`);
  input.addEventListener('change', () => {
    skillState.set(skill.name, input.checked);
    option.classList.toggle('is-enabled', input.checked);
    updateSkillCounts();
  });

  const copy = document.createElement('span');
  copy.className = 'skill-option-copy';
  const label = document.createElement('strong');
  label.textContent = skill.label;
  const description = document.createElement('small');
  description.id = `skill-description-${skill.name}`;
  description.textContent = skill.description;
  copy.append(label, description);

  const meta = document.createElement('span');
  meta.className = 'skill-option-meta';
  const slug = document.createElement('code');
  slug.textContent = skill.name;
  const state = document.createElement('span');
  state.textContent = skill.required ? 'Required later' : 'Optional';
  meta.append(slug, state);

  option.append(input, copy, meta);
  return option;
}

function renderSkillPicker() {
  const groups = HARNESS_SKILL_GROUPS.map((group) => {
    const section = document.createElement('section');
    section.className = 'skill-group';
    section.setAttribute('aria-labelledby', `skill-group-${group.id}`);

    const head = document.createElement('header');
    head.className = 'skill-group-head';
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.id = `skill-group-${group.id}`;
    title.textContent = group.label;
    const description = document.createElement('p');
    description.textContent = group.description;
    copy.append(title, description);
    const count = document.createElement('output');
    count.dataset.groupCount = group.id;
    head.append(copy, count);

    const options = HARNESS_SKILL_CATALOG
      .filter((skill) => skill.group === group.id)
      .map(skillOption);
    section.append(head, ...options);
    return section;
  });
  skillGroups.replaceChildren(...groups);
  updateSkillCounts();
}

function setOptionalSkills(enabled) {
  for (const skill of HARNESS_SKILL_CATALOG) {
    if (skill.required) continue;
    skillState.set(skill.name, enabled);
    const input = skillGroups.querySelector(`[data-skill-name="${skill.name}"]`);
    input.checked = enabled;
    input.closest('.skill-option').classList.toggle('is-enabled', enabled);
  }
  updateSkillCounts();
}

function closeSkillPicker() {
  if (skillPicker.open) skillPicker.close();
}

skillTrigger.addEventListener('click', () => {
  skillTrigger.setAttribute('aria-expanded', 'true');
  skillPicker.showModal();
  skillPickerClose.focus();
});

skillPicker.addEventListener('close', () => {
  skillTrigger.setAttribute('aria-expanded', 'false');
  skillTrigger.focus();
});
skillPicker.addEventListener('click', (event) => {
  if (event.target === skillPicker) closeSkillPicker();
});
skillPicker.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  closeSkillPicker();
});
skillPickerClose.addEventListener('click', closeSkillPicker);
skillsDone.addEventListener('click', closeSkillPicker);
skillsEnableAll.addEventListener('click', () => setOptionalSkills(true));
skillsClearOptional.addEventListener('click', () => setOptionalSkills(false));

async function loadStatus() {
  try {
    const response = await fetch('/api/harness/github/status', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Creator status unavailable');
    const status = await response.json();
    templateButton.href = status.fallbackUrl;

    if (!status.available) {
      setConnection('GitHub template ready', 'Create the repo through GitHub with all Harness skills included');
      connectButton.href = status.fallbackUrl;
      connectButton.querySelector('span').textContent = 'Create on GitHub';
      templateButton.hidden = true;
      fallback.hidden = false;
      return;
    }

    if (!status.connected) {
      if (status.accounts?.length) {
        setConnection('Choose a GitHub account', 'Pick where this repository should be created');
        fallback.hidden = true;
        accountChoice.hidden = false;
        accountSelect.replaceChildren(...status.accounts.map((account) => {
          const option = document.createElement('option');
          option.value = String(account.installationId);
          option.textContent = account.owner;
          return option;
        }));
        return;
      }
      setConnection('GitHub connection needed', 'Authorize once, then future projects are one click');
      fallback.hidden = false;
      return;
    }

    setConnection(`Connected as ${status.owner}`, 'Choose the repository details and active skill set', true);
    showCreatorForm();
  } catch (error) {
    setConnection('GitHub template ready', 'Create the repo through GitHub with all Harness skills included');
    connectButton.href = 'https://github.com/ryanportfolio/Harness-Firmware/generate';
    connectButton.querySelector('span').textContent = 'Create on GitHub';
    templateButton.hidden = true;
    fallback.hidden = false;
  } finally {
    creatorPanel.classList.remove('is-loading');
  }
}

accountChoice.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const button = accountChoice.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/harness/github/select', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: Number(accountSelect.value) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'GitHub account selection failed');
    accountChoice.hidden = true;
    setConnection(`Connected as ${result.owner}`, 'Choose the repository details and active skill set', true);
    showCreatorForm();
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

disconnectButton.addEventListener('click', async () => {
  disconnectButton.disabled = true;
  skillTrigger.disabled = true;
  errorBox.textContent = '';
  try {
    const response = await fetch('/api/harness/github/disconnect', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('GitHub connection could not be reset');
    window.location.assign('/api/harness/github/connect');
  } catch (error) {
    errorBox.textContent = error.message;
    disconnectButton.disabled = false;
    skillTrigger.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  isCreating = true;
  createButton.disabled = true;
  skillTrigger.disabled = true;
  createButton.querySelector('span').textContent = 'Creating repository';

  const data = new FormData(form);
  try {
    const response = await fetch('/api/harness/github/create', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name') || '').trim(),
        description: String(data.get('description') || '').trim(),
        private: data.get('private') === 'on',
        disabledSkills: selectedDisabledSkills(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'GitHub could not create the repository');

    form.hidden = true;
    connection.hidden = true;
    success.hidden = false;
    document.querySelector('#success-name').textContent = result.fullName;
    document.querySelector('#success-link').href = result.repositoryUrl;
    const disabledCount = result.customized ? result.disabledSkillCount : 0;
    successSummary.textContent = disabledCount > 0
      ? `${HARNESS_SKILL_CATALOG.length - disabledCount} skills enabled. ${disabledCount} disabled and ready to restore.`
      : `All ${HARNESS_SKILL_CATALOG.length} skills enabled.`;
    successWarning.hidden = !result.customizationWarning;
    successWarning.textContent = result.customizationWarning || '';
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    isCreating = false;
    createButton.disabled = false;
    skillTrigger.disabled = false;
    updateSkillCounts();
  }
});

const query = new URLSearchParams(window.location.search);
if (query.get('error')) errorBox.textContent = 'GitHub connection was not completed. Try again or use the template.';
renderSkillPicker();
loadStatus();
