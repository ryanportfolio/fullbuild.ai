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

function setConnection(title, copy, connected = false) {
  connection.classList.toggle('connected', connected);
  connection.querySelector('strong').textContent = title;
  connection.querySelector('p').textContent = copy;
}

async function loadStatus() {
  try {
    const response = await fetch('/api/harness/github/status', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Creator status unavailable');
    const status = await response.json();
    templateButton.href = status.fallbackUrl;

    if (!status.available) {
      setConnection('GitHub template ready', 'Create the repo through GitHub with Harness already included');
      connectButton.href = status.fallbackUrl;
      connectButton.querySelector('span').textContent = 'Create on GitHub';
      templateButton.hidden = true;
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
      return;
    }

    setConnection(`Connected as ${status.owner}`, 'New repositories will be created in this account', true);
    fallback.hidden = true;
    form.hidden = false;
  } catch (error) {
    setConnection('GitHub template ready', 'Create the repo through GitHub with Harness already included');
    connectButton.href = 'https://github.com/ryanportfolio/Harness-Firmware/generate';
    connectButton.querySelector('span').textContent = 'Create on GitHub';
    templateButton.hidden = true;
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
    setConnection(`Connected as ${result.owner}`, 'New repositories will be created in this account', true);
    form.hidden = false;
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

disconnectButton.addEventListener('click', async () => {
  disconnectButton.disabled = true;
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
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  createButton.disabled = true;
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
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'GitHub could not create the repository');

    form.hidden = true;
    connection.hidden = true;
    success.hidden = false;
    document.querySelector('#success-name').textContent = result.fullName;
    document.querySelector('#success-link').href = result.repositoryUrl;
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    createButton.disabled = false;
    createButton.querySelector('span').textContent = 'Create repository';
  }
});

const query = new URLSearchParams(window.location.search);
if (query.get('error')) errorBox.textContent = 'GitHub connection was not completed. Try again or use the template.';
loadStatus();
