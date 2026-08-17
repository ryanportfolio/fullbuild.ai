// playful · form.mjs
// Waitlist forms resolve locally. No network, no storage.

for (const form of document.querySelectorAll("form.join")) {
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const note = form.querySelector(".join-note");
  const done = form.querySelector(".join-done");

  input.addEventListener("input", () => input.removeAttribute("aria-invalid"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    // novalidate silences the browser bubble, so the rejected path has to
    // speak for itself: flag the field and say it in the live region.
    if (!input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      if (done) {
        done.hidden = false;
        done.textContent = "That address looks off, mind checking it";
      }
      input.focus();
      return;
    }

    input.removeAttribute("aria-invalid");
    form.classList.add("is-done");
    if (note) note.hidden = true;
    if (done) {
      done.hidden = false;
      done.textContent = "You're on the list, first invites go out soon";
      // The button is holding focus and is about to be disabled, which would
      // drop focus to the body. Send it to the confirmation instead.
      done.focus();
    }
    button.disabled = true;
    button.textContent = "Joined";
  });
}
