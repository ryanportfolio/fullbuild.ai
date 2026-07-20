# Pitfalls

Keep dated project-specific symptoms, causes, and fixes here. Split by area and update `AGENTS.md` if this file grows beyond about 200 lines.

### 2026-07-18: Local preview shows a stale or wrong site

**Symptom:** A local development or preview server shows an outdated version of the site or a different project.

**Likely causes:** A busy port reused another process, the server runs from the wrong checkout or worktree, static build output is stale, or browser cache/service workers retain old assets.

**Prevention:** Inspect the process bound to the chosen port and verify its working directory. Use a fresh port when ownership is uncertain. Rebuild static output and confirm its modification time is newer than edited sources. After loading, verify a string unique to the current change through page-text extraction. If the sentinel is absent, stop and diagnose before claiming success; only then try a hard reload or service-worker cleanup.

### 2026-07-20: Mobile positioning can retain desktop offsets

**Symptom:** A heading remains clipped on mobile even after changing it from absolute to static layout. **Cause:** A later `position: relative` reactivates inherited desktop `top` or `left` offsets. **Fix:** Clear positional offsets explicitly in the mobile rule and verify the rendered bounding box in Chrome.

### 2026-07-20: Browser automation waits on the truthful Shipped lock

**Symptom:** Playwright `locator.click()` waits until timeout on the Shipped phase control. **Cause:** The control correctly exposes `aria-disabled="true"`, which Playwright treats as disabled. **Fix:** Use `dispatchEvent("click")` when auditing the guarded handler, then assert the active phase remains Engineering and the pending-proof feedback becomes visible.
