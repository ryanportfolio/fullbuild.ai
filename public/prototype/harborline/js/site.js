// Mobile nav toggle
(function () {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
            nav.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
})();

// The fit check on the haul request. Every limit it reasons about comes off the
// service entries as data attributes, so a service whose limits change in the
// CMS changes what this form will accept. The useful answer here is the refusal:
// a boat the yard cannot take should be told so on the page rather than after a
// phone call.
(function () {
    var form = document.querySelector('.request-form');
    var report = document.getElementById('fit-report');
    if (!form || !report) return;

    var loa = form.querySelector('#loa');
    var draft = form.querySelector('#draft');
    var beam = form.querySelector('#beam');
    var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="service[]"]'));

    // The yard's own limits come off the company global, not out of this file,
    // so a yard that buys a bigger lift changes one field and this agrees.
    var yardMaxLoa = parseFloat(form.getAttribute('data-yard-max-loa'));
    var yardMaxBeam = parseFloat(form.getAttribute('data-yard-max-beam'));
    var yardSill = parseFloat(form.getAttribute('data-yard-sill'));

    function num(input) {
        var v = parseFloat(input.value);
        return isNaN(v) ? null : v;
    }

    function line(text, state) {
        var p = document.createElement('p');
        p.className = 'fit-line';
        if (state) p.setAttribute('data-fit', state);
        p.textContent = text;
        return p;
    }

    function update() {
        var l = num(loa);
        var d = num(draft);
        var b = num(beam);
        var chosen = boxes.filter(function (b) { return b.checked; });

        report.textContent = '';

        if (l === null && b === null && !chosen.length) return;

        // The yard-level refusal comes before the per-service one. A boat the
        // lift cannot pick up is not a question about which job you wanted.
        var hard = [];
        if (l !== null && yardMaxLoa && l > yardMaxLoa) hard.push('the lift takes ' + yardMaxLoa + ' ft and that boat is ' + l);
        if (b !== null && yardMaxBeam && b > yardMaxBeam) hard.push('the slings are ' + yardMaxBeam + ' ft wide and that beam is ' + b);

        if (hard.length) {
            report.appendChild(line('We cannot haul that boat.', 'no'));
            hard.forEach(function (why) { report.appendChild(line(why.charAt(0).toUpperCase() + why.slice(1) + '.', 'no')); });
            report.appendChild(line('Call the yard and we will tell you who on the bay can take it.', 'no'));
            return;
        }

        // Which of the chosen services can actually take this boat.
        var fits = [];
        var refused = [];

        chosen.forEach(function (b) {
            var min = parseFloat(b.getAttribute('data-min-loa'));
            var max = parseFloat(b.getAttribute('data-max-loa'));
            var maxDraft = parseFloat(b.getAttribute('data-max-draft'));
            var why = [];

            if (l !== null && l < min) why.push('needs at least ' + min + ' ft');
            if (l !== null && l > max) why.push('takes up to ' + max + ' ft');
            if (d !== null && d > maxDraft) why.push('draft limit ' + maxDraft + ' ft');

            if (why.length) {
                refused.push({ title: b.getAttribute('data-title'), why: why.join(', ') });
            } else {
                fits.push(b);
            }
        });

        if (chosen.length && !fits.length) {
            // The honest no. Say which boats the yard does take rather than
            // leaving the visitor to guess.
            report.appendChild(line('None of the work you picked fits that boat.', 'no'));
            refused.forEach(function (r) {
                report.appendChild(line(r.title + ': ' + r.why, 'no'));
            });
            report.appendChild(line('Call the yard. We would rather say so now than after you have towed it here.', 'no'));
            return;
        }

        if (refused.length) {
            refused.forEach(function (r) {
                report.appendChild(line(r.title + ' will not fit: ' + r.why, 'warn'));
            });
        }

        if (fits.length) {
            // Two jobs in one haul do not sum their days: the boat is only out
            // of the water once, so the haul runs as long as its longest job.
            var days = fits.reduce(function (max, b) {
                return Math.max(max, parseInt(b.getAttribute('data-days'), 10) || 0);
            }, 0);
            var lead = fits.reduce(function (max, b) {
                return Math.max(max, parseInt(b.getAttribute('data-lead'), 10) || 0);
            }, 0);
            var summed = fits.reduce(function (sum, b) {
                return sum + (parseInt(b.getAttribute('data-days'), 10) || 0);
            }, 0);

            var word = fits.length === 1 ? 'job' : 'jobs';
            var dayWord = days === 1 ? 'day' : 'days';
            report.appendChild(line(fits.length + ' ' + word + ', about ' + days + ' ' + dayWord + ' on the hard.', 'yes'));

            if (summed > days) {
                report.appendChild(line('One haul covers all of it, so that is ' + days + ' days rather than ' + summed + '.', 'yes'));
            }

            if (lead > 0) {
                report.appendChild(line('Earliest start is about ' + lead + (lead === 1 ? ' week' : ' weeks') + ' out.', 'yes'));
            }

            // Inside about a foot and a half of the sill is a tide question
            // rather than a refusal. A binary go or no-go here would be a lie,
            // and the yard lives in that margin.
            if (d !== null && yardSill && d > yardSill - 1.5) {
                report.appendChild(line('At ' + d + ' ft you clear the ' + yardSill + ' ft sill on a rising tide. We schedule the lift around it.', 'warn'));
            }
        }
    }

    [loa, draft].forEach(function (el) { if (el) el.addEventListener('input', update); });
    boxes.forEach(function (b) { b.addEventListener('change', update); });

    form.addEventListener('submit', function (e) {
        // A prototype with no backend should say so rather than pretend to send.
        e.preventDefault();
        report.textContent = '';
        report.appendChild(line('This is a prototype, so nothing was sent. On the real site this posts to the yard.', 'warn'));
    });
})();

// Structure mode. The page labels its own regions with the collection, entry
// and field that produced them, reading schema.json rather than any text typed
// into a template. The unused count is whatever the blueprints hold minus what
// the templates stamp, so it is allowed to be, and usually is, non-zero.
(function () {
    var root = document.documentElement;
    var blob = document.getElementById('fb-schema');
    var switchEl = document.querySelector('[data-fb-switch]');
    if (!blob || !switchEl) return;

    var schema;
    try {
        schema = JSON.parse(blob.textContent);
    } catch (e) {
        return;
    }
    if (!schema || !schema.namespaces) return;

    var fieldIndex = {};
    Object.keys(schema.namespaces).forEach(function (ns) {
        schema.namespaces[ns].fields.forEach(function (field) {
            fieldIndex[ns + '.' + field.handle] = field;
        });
    });

    function counts(ns) {
        var fields = schema.namespaces[ns] ? schema.namespaces[ns].fields : [];
        var rendered = fields.filter(function (f) { return f.rendered; }).length;
        return { fields: fields.length, rendered: rendered, unused: fields.length - rendered };
    }

    // Field labels: handle plus the fieldtype the blueprint declares.
    document.querySelectorAll('[data-fb-field]').forEach(function (el) {
        var key = el.getAttribute('data-fb-field');
        var field = fieldIndex[key];
        if (!field) {
            // A stamp with no blueprint behind it. Say so rather than hide it.
            el.setAttribute('data-fb-label', key + ' · orphan');
            el.setAttribute('data-fb-orphan', 'true');
            return;
        }
        el.setAttribute('data-fb-label', field.handle + ' · ' + field.type);
    });

    // Region labels: which collection, how many entries, and the query that
    // selected them.
    document.querySelectorAll('[data-fb-region]').forEach(function (el) {
        var ns = el.getAttribute('data-fb-region');
        var meta = schema.namespaces[ns];
        if (!meta) return;

        var shown = el.querySelectorAll('[data-fb-entry]').length;
        var c = counts(ns);
        var parts = [ns, meta.kind, shown + ' of ' + meta.entries];
        var query = el.getAttribute('data-fb-query');
        if (query) parts.push(query.replace(/^collection:[a-z0-9_]+\s*/, ''));

        el.setAttribute('data-fb-label', parts.join(' · '));
        el.setAttribute('data-fb-audit', c.fields + ' fields · ' + c.rendered + ' rendered · ' + c.unused + ' unused');
        if (c.unused > 0) el.setAttribute('data-fb-partial', 'true');
    });

    // Site-wide audit line.
    var t = schema.totals || { fields: 0, rendered: 0, unused: 0 };
    var orphans = (schema.orphans || []).length;
    var audit = document.createElement('p');
    audit.className = 'fb-switch-audit';
    audit.textContent = t.fields + ' fields · ' + t.rendered + ' rendered · ' + t.unused + ' unused · ' + orphans + ' orphan';
    if (t.unused > 0) audit.setAttribute('data-fb-partial', 'true');
    if (orphans > 0) audit.setAttribute('data-fb-orphan', 'true');
    switchEl.appendChild(audit);

    var buttons = switchEl.querySelectorAll('[data-fb-mode-button]');
    var labelled = Array.prototype.slice.call(document.querySelectorAll('[data-fb-label]'));

    /**
     * Several stamped fields often share one line: a rate and its basis, or the
     * three numbers in a size range. Their labels would then land on top of each
     * other. Give each label a lane so an overlapping one stacks above rather
     * than colliding, measuring the real rendered width instead of guessing.
     */
    function assignLanes() {
        var probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:0.62rem;letter-spacing:0.03em';
        probe.style.fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--mono');
        document.body.appendChild(probe);

        var rows = [];

        labelled.forEach(function (el) {
            el.style.removeProperty('--fb-lane');

            var rect = el.getBoundingClientRect();
            if (!rect.width && !rect.height) return;

            probe.textContent = el.getAttribute('data-fb-label') || '';
            var width = probe.getBoundingClientRect().width;

            var top = Math.round((rect.top + window.scrollY) / 8) * 8;
            var row = rows.filter(function (r) { return r.top === top; })[0];
            if (!row) {
                row = { top: top, lanes: [] };
                rows.push(row);
            }

            var left = rect.left + window.scrollX;
            var lane = 0;
            while (row.lanes[lane] !== undefined && row.lanes[lane] > left - 8) lane++;
            row.lanes[lane] = left + width;

            if (lane > 0) el.style.setProperty('--fb-lane', lane);
        });

        document.body.removeChild(probe);
    }

    function setMode(mode) {
        root.setAttribute('data-fb-mode', mode);
        buttons.forEach(function (b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-fb-mode-button') === mode ? 'true' : 'false');
        });
        if (mode === 'structure') assignLanes();
    }

    var resizeTimer;
    window.addEventListener('resize', function () {
        if (root.getAttribute('data-fb-mode') !== 'structure') return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(assignLanes, 150);
    });

    buttons.forEach(function (b) {
        b.addEventListener('click', function () {
            setMode(b.getAttribute('data-fb-mode-button'));
        });
    });

    setMode('hull');
})();
