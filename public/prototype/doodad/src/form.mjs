// doodad · form.mjs
// Both waitlist forms resolve locally. No network, no storage, no endpoint.

for (const form of document.querySelectorAll("form.waitlist")) {
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const message = form.querySelector(".waitlist-msg");

  input.addEventListener("input", () => input.removeAttribute("aria-invalid"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    // novalidate silences the browser bubble, so the rejected path has to
    // speak for itself: flag the field, say it in the live region, put focus
    // back where the fix has to happen.
    if (!input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      if (message) {
        message.hidden = false;
        message.textContent = "That address looks off, mind checking it";
      }
      input.focus();
      return;
    }

    input.removeAttribute("aria-invalid");

    if (message) {
      message.hidden = false;
      message.textContent = "You're on the list, first invites go out soon";
      // The button is holding focus and is about to be disabled, which would
      // drop focus to the body. Send it to the confirmation instead.
      message.focus();
    }

    button.disabled = true;
    button.textContent = "Joined";
  });
}
