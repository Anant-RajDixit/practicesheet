(() => {
  "use strict";

  const API_URL = window.API_URL || "/predict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (id) => document.getElementById(id);
  const form = $("loan-form");
  const result = $("result");
  const submitBtn = $("submit");

  const els = {
    badge: $("badge"),
    pct: $("pct"),
    title: $("verdict-title"),
    text: $("verdict-text"),
    prob: $("fact-prob"),
    threshold: $("fact-threshold"),
    margin: $("fact-margin"),
    note: $("note"),
    fill: $("arc-fill"),
    zoneLow: $("zone-low"),
    zoneHigh: $("zone-high"),
    tick: $("tick"),
    tickLabel: $("tick-label"),
    knob: $("knob"),
    shareFill: $("share-fill"),
    shareValue: $("share-value"),
    shareHint: $("share-hint"),
  };

  const DEFAULT_NOTE = "The result is a model estimate to support a decision, not the decision itself.";

  /* ---------- Gauge geometry (matches the SVG viewBox) ---------- */

  const CX = 130, CY = 128, R = 104;
  const clamp01 = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  const fmtPct = (v, digits = 1) => `${(v * 100).toFixed(digits)}%`;

  // Point on the arc at fraction f (0 = left end, 1 = right end) and radius r
  function pointAt(f, r = R) {
    const a = Math.PI * (1 - f);
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
  }

  function setFill(v) {
    els.fill.style.strokeDashoffset = String(100 - v * 100);
    const p = pointAt(v);
    els.knob.setAttribute("cx", p.x.toFixed(2));
    els.knob.setAttribute("cy", p.y.toFixed(2));
  }

  function drawZones(t) {
    els.zoneLow.style.strokeDasharray = `${t * 100} 100`;
    els.zoneLow.style.strokeDashoffset = "0";
    els.zoneHigh.style.strokeDasharray = `${(1 - t) * 100} 100`;
    els.zoneHigh.style.strokeDashoffset = String(-t * 100);

    const a = pointAt(t, 92);
    const b = pointAt(t, 118);
    els.tick.setAttribute("x1", a.x.toFixed(2));
    els.tick.setAttribute("y1", a.y.toFixed(2));
    els.tick.setAttribute("x2", b.x.toFixed(2));
    els.tick.setAttribute("y2", b.y.toFixed(2));

    const l = pointAt(t, 76);
    els.tickLabel.setAttribute("x", l.x.toFixed(2));
    els.tickLabel.setAttribute("y", l.y.toFixed(2));
  }

  let raf = 0;
  function animateTo(target) {
    cancelAnimationFrame(raf);
    const duration = reduceMotion ? 0 : 1300;
    const start = performance.now();

    const step = (now) => {
      const k = duration ? Math.min((now - start) / duration, 1) : 1;
      const eased = 1 - Math.pow(1 - k, 3);
      const v = target * eased;
      setFill(v);
      els.pct.textContent = fmtPct(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------- Panel states ---------- */

  function setState(state, risk = "") {
    result.dataset.state = state;
    result.dataset.risk = risk;
    result.dataset.stale = "false";
  }

  function showLoading() {
    cancelAnimationFrame(raf);
    setFill(0);
    setState("loading");
    els.badge.textContent = "Scoring";
    els.pct.textContent = "…";
    els.title.textContent = "Scoring application";
    els.text.textContent = "Running the model.";
    els.note.textContent = DEFAULT_NOTE;
  }

  function showResult(data) {
    const p = clamp01(Number(data.default_probability));
    const t = clamp01(Number(data.threshold));
    const high = Number(data.default_prediction) === 1;

    setState("done", high ? "high" : "low");
    drawZones(t);
    animateTo(p);

    els.badge.textContent = high ? "High risk" : "Low risk";
    els.title.textContent = high ? "High risk" : "Low risk";
    els.text.textContent = high
      ? "The estimated chance of default is at or above the cut-off, so this application is flagged."
      : "The estimated chance of default is below the cut-off, so this application clears it.";

    const diff = (p - t) * 100;
    els.prob.textContent = fmtPct(p);
    els.threshold.textContent = fmtPct(t);
    els.margin.textContent = `${Math.abs(diff).toFixed(1)} points ${diff >= 0 ? "above" : "below"}`;
    els.note.textContent = DEFAULT_NOTE;
  }

  function showError(message) {
    cancelAnimationFrame(raf);
    setFill(0);
    setState("error");
    els.badge.textContent = "Error";
    els.pct.textContent = "–";
    els.title.textContent = "Couldn't get a result";
    els.text.textContent = message;
    els.note.textContent = "Check the values and try again.";
  }

  function formatDetail(detail) {
    if (Array.isArray(detail)) {
      return detail
        .map((d) => `${(d.loc || []).slice(1).join(".") || "input"}: ${d.msg}`)
        .join("; ");
    }
    return typeof detail === "string" ? detail : "";
  }

  /* ---------- Form ---------- */

  function buildPayload() {
    const f = new FormData(form);
    const income = parseFloat(f.get("person_income"));
    const amount = parseFloat(f.get("loan_amnt"));

    return {
      person_age: parseInt(f.get("person_age"), 10),
      person_income: income,
      person_home_ownership: f.get("person_home_ownership"),
      person_emp_length: parseFloat(f.get("person_emp_length")),
      loan_intent: f.get("loan_intent"),
      loan_grade: f.get("loan_grade"),
      loan_amnt: amount,
      loan_int_rate: parseFloat(f.get("loan_int_rate")),
      loan_percent_income: Number((amount / income).toFixed(2)),
      cb_person_default_on_file: f.get("cb_person_default_on_file"),
      cb_person_cred_hist_length: parseInt(f.get("cb_person_cred_hist_length"), 10),
    };
  }

  function updateShare() {
    const income = parseFloat(form.person_income.value);
    const amount = parseFloat(form.loan_amnt.value);

    if (income > 0 && amount > 0) {
      const ratio = amount / income;
      els.shareFill.style.width = `${Math.min(ratio, 1) * 100}%`;
      els.shareValue.textContent = `${Math.round(ratio * 100)}%`;
      els.shareHint.textContent = `The loan is ${ratio.toFixed(2)} times a year of income. This value is sent to the model.`;
    } else {
      els.shareFill.style.width = "0";
      els.shareValue.textContent = "–";
      els.shareHint.textContent = "Calculated from the amount and income above.";
    }
  }

  const SAMPLES = {
    steady: {
      person_age: 38, person_income: 92000, person_home_ownership: "MORTGAGE",
      person_emp_length: 9, loan_intent: "HOMEIMPROVEMENT", loan_grade: "A",
      loan_amnt: 9000, loan_int_rate: 7.5, cb_person_default_on_file: "N",
      cb_person_cred_hist_length: 14,
    },
    stretched: {
      person_age: 23, person_income: 26000, person_home_ownership: "RENT",
      person_emp_length: 1, loan_intent: "MEDICAL", loan_grade: "E",
      loan_amnt: 14000, loan_int_rate: 17.8, cb_person_default_on_file: "Y",
      cb_person_cred_hist_length: 2,
    },
  };

  function loadSample(name) {
    const sample = SAMPLES[name];
    if (!sample) return;

    Object.entries(sample).forEach(([key, value]) => {
      const radio = form.querySelector(`input[type="radio"][name="${key}"][value="${value}"]`);
      if (radio) {
        radio.checked = true;
      } else if (form.elements[key]) {
        form.elements[key].value = value;
      }
    });
    updateShare();
    markStale();
  }

  function markStale() {
    if (result.dataset.state === "done") {
      result.dataset.stale = "true";
      els.note.textContent = "The inputs changed. Select Assess risk to update this result.";
    }
  }

  /* ---------- Events ---------- */

  form.addEventListener("input", () => {
    updateShare();
    markStale();
  });

  document.querySelectorAll("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => loadSample(btn.dataset.sample));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const payload = buildPayload();
    submitBtn.disabled = true;
    submitBtn.textContent = "Scoring…";
    showLoading();

    if (window.matchMedia("(max-width: 920px)").matches) {
      result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 90000);
    // Free hosting can sleep; tell the user why the first request is slow.
    const slowTimer = setTimeout(() => {
      els.text.textContent = "The server may be waking up. This can take up to a minute.";
    }, 6000);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = "";
        try { detail = formatDetail((await res.json()).detail); } catch (_) { /* no body */ }
        throw new Error(detail || `The server returned status ${res.status}.`);
      }

      showResult(await res.json());
    } catch (err) {
      showError(
        err.name === "AbortError"
          ? "The request timed out. Try again in a moment."
          : err instanceof TypeError
            ? "Couldn't reach the server. Check your connection and try again."
            : err.message
      );
    } finally {
      clearTimeout(abortTimer);
      clearTimeout(slowTimer);
      submitBtn.disabled = false;
      submitBtn.textContent = "Assess risk";
    }
  });

  updateShare();
  setFill(0);
})();
