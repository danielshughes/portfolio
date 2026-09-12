# Experiment Copy Implementation Plan

> **Historical implementation plan, not an open task list.** The copy work is incorporated in the implementation. The [experiment contract](../../experiments.md) owns current wording principles and behaviour; source and tests own exact text. This record retains the original copy decisions and proposed verification sequence. Unchecked steps below preserve that proposal, not outstanding work or evidence that each step ran exactly as written.

**Goal:** Make the supporting copy for every experiment concrete and easy to understand while keeping the existing playful titles, visual language, interaction behaviour and evidence limits.

**Architecture:** Keep copy beside the component or typed data that renders it. Static card copy remains in the Astro components, Radar view copy remains in `radar-tabs.ts`, and AI scenario copy remains in `triage-scenarios.ts`. Update the experiment documentation and focused browser assertions in the same change so visible wording and documented behaviour cannot drift.

**Tech Stack:** Astro, TypeScript, Playwright, Node test runner, Markdown documentation.

**Spec:** `docs/superpowers/specs/2026-09-11-experiment-copy-design.md`

## Global Constraints

- Keep every existing experiment title unchanged.
- Use plain British English, with short sentences and no em dashes.
- Each subtitle must say what the visitor can change or start; each body line must say what to watch.
- Keep technology labels outside Explore and name only implemented services, runtime APIs or browser renderers.
- Do not add claims about production scale, ownership, uptime, routing, service discovery, model certainty or completed checks.
- Keep Radar attribution, licence, transformation notice and event boundaries.
- Keep AI facts, reviewed interpretation, structured model output and safety boundaries separate.
- Do not change controls, animations, API calls, data sources or request limits.

---

### Task 1: Rewrite browser-simulation supporting copy

**Files:**

- Modify: `src/pages/experiments.astro:17-355`
- Test: `tests/visual/experiment-copy.spec.ts`

**Interfaces:**

- Consumes: Existing `ExperimentCard` slots and controls.
- Produces: The same six browser simulations with clearer subtitles, body copy, outputs and disclosure labels.

- [ ] **Step 1: Add focused copy assertions for the six titles and new supporting lines.**

Create a Playwright test that opens `/experiments/`, checks the six existing card titles, and checks these exact visible strings after each card is opened:

```ts
const expected = [
  [
    "Room for one more?",
    "Raise CPU demand and watch the replica target change, then see which pods fit.",
  ],
  [
    "Who’s allowed to do what?",
    "Choose a scenario, set the call budget and decide whether a simulated write is allowed.",
  ],
  [
    "A little interference.",
    "Compare a clean wave with the same wave after interference is added.",
  ],
  [
    "The average looks fine.",
    "Keep most requests steady, then stretch the slowest ten.",
  ],
  [
    "Requests in flight.",
    "Change how many requests run together and see which finish before the deadline.",
  ],
  [
    "A small connected world.",
    "Rotate the graph or select a node to see its direct connections.",
  ],
] as const;
```

- [ ] **Step 2: Run the focused test and verify it fails against the current copy.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium`

Expected: FAIL because the current subtitles still contain the abstract supporting lines.

- [ ] **Step 3: Write the minimal static copy change.**

Apply these replacements in `src/pages/experiments.astro`:

```astro
subtitle="Raise CPU demand and watch the replica target change, then see which
pods fit."
<p>
  Turn up CPU demand. HPA changes the target, then the scheduler tries to place
  each pod.
</p>
<output aria-live="polite" aria-atomic="true">
  HPA sets the replica target. Placement uses each pod's CPU request, so a pod
  can stay pending when there is no room.
</output>
subtitle="Choose a scenario, set the call budget and decide whether a simulated
write is allowed."
<p>
  Follow the scripted agent as it checks context, calls tools and stops at a
  timeout, missing context or denied write.
</p>
<output aria-live="polite" aria-atomic="true">
  The script proposes a call. The host checks context, budget and approval
  before a simulated write.
</output>
<summary>Follow the trace</summary>
subtitle="Compare a clean wave with the same wave after interference is added."
<p>
  The upper trace stays clean. Change the lower trace's noise, frequency and
  amplitude.
</p>
subtitle="Keep most requests steady, then stretch the slowest ten."
<p>
  Move the tail slider and watch the median stay put while the slow end grows.
</p>
<output aria-live="polite" aria-atomic="true">
  The median stays steady; the slowest requests move the upper percentiles.
</output>
subtitle="Change how many requests run together and see which finish before the
deadline."
<p>
  Run the lookup with a different number in flight. Queued time counts against
  the deadline.
</p>
<output aria-live="polite" aria-atomic="true">
  The readout will show how many of 12 requests meet the deadline.
</output>
subtitle="Rotate the graph or select a node to see its direct connections."
<p>
  Drag to rotate. Select a node to highlight its neighbours and dim the rest.
</p>
<summary>See the connections</summary>
```

Keep the existing local footnotes unless a replacement has exactly the same boundary meaning. Do not change the controls or simulation logic.

- [ ] **Step 4: Run the focused test and verify it passes.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium`

Expected: PASS, with all six titles unchanged and the new supporting copy visible.

- [ ] **Step 5: Commit the browser-simulation copy.**

```bash
git add src/pages/experiments.astro tests/visual/experiment-copy.spec.ts
git commit -S -m "copy: clarify browser experiments"
```

### Task 2: Rewrite live, streaming and AI card copy

**Files:**

- Modify: `src/components/LiveExperiments.astro:9-189`
- Modify: `src/components/StreamExperiment.astro:5-65`
- Modify: `src/components/TriageExperiment.astro:16-75`
- Test: `tests/visual/experiment-copy.spec.ts`

**Interfaces:**

- Consumes: Existing live card components and lazy runtime module.
- Produces: Clear live request descriptions with unchanged controls, safety copy and lazy loading behaviour.

- [ ] **Step 1: Extend the focused test with live and AI copy checks.**

Add assertions for these exact strings:

```ts
const liveCopy = [
  "Your request, at the edge.",
  "A day of scheduled checks, including gaps.",
  "Start a response and watch six chunks arrive.",
  "Connect two windows and send a numbered pulse between them.",
  "Choose a fictional incident and get a hypothesis, two checks and the unknowns.",
] as const;
```

Also assert that the AI result labels remain `Model suggestion`, `A possible explanation`, `Suggested read-only checks` and `Still unknown` after the existing structured response fixture completes.

- [ ] **Step 2: Run the focused live-copy test and verify the new assertions fail.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium`

Expected: FAIL on the current poetic subtitles.

- [ ] **Step 3: Write the minimal live copy change.**

Apply these replacements:

```astro
<p class="eyebrow">A few live requests</p>
<p class="live-intro">
  These cards make bounded requests to Cloudflare, then show exactly what comes
  back.
</p>
subtitle="Your request, at the edge." caption="Illustration; open to inspect the
metadata returned for this request" subtitle="A day of scheduled checks,
including gaps." caption="Scheduled checks; open to inspect recorded response
headers" subtitle="Start a response and watch six chunks arrive."
caption="Illustration; run it to receive six real chunks" subtitle="Connect two
windows and send a numbered pulse between them." caption="Shared sequence;
connect to send a real pulse"
<p>
  Choose a fictional incident and get a hypothesis, two checks and the unknowns.
</p>
<p class="live-footnote">
  This is the authored baseline for comparison. The model sees only the selected
  facts and question.
</p>
```

Keep the existing model, Turnstile, D1, no-tools, no-live-systems, no-IP and illustrative-travel boundaries. Do not alter runtime status messages unless a test proves they contradict the new copy.

- [ ] **Step 4: Run the focused live-copy test and verify it passes.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium`

Expected: PASS, including the structured AI labels and all five live card titles.

- [ ] **Step 5: Commit the live copy.**

```bash
git add src/components/LiveExperiments.astro src/components/StreamExperiment.astro src/components/TriageExperiment.astro tests/visual/experiment-copy.spec.ts
git commit -S -m "copy: clarify live experiments"
```

### Task 3: Rewrite Radar and AI scenario wording

**Files:**

- Modify: `src/components/InternetMap.astro:17-32,114-172,279-315`
- Modify: `src/experiments/radar-tabs.ts:6-30`
- Modify: `src/experiments/triage-scenarios.ts:2-29`
- Test: `tests/visual/experiment-copy.spec.ts`

**Interfaces:**

- Consumes: Typed `RadarView` metadata and typed `triageScenarios` records.
- Produces: Concrete tab descriptions, reading guides and scenario questions without changing data interpretation or validation.

- [ ] **Step 1: Add Radar and scenario assertions to the focused test.**

Assert the map subtitle, reading label, four descriptions, four guides and the three scenario questions. The test must also assert the existing attribution links remain present.

- [ ] **Step 2: Run the focused test and verify it fails on the old wording.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium`

Expected: FAIL on the old Radar descriptions and scenario questions.

- [ ] **Step 3: Write the minimal Radar copy change.**

In `src/components/InternetMap.astro`, use:

```astro
<p>Pick a country and scrub through its observed week.</p>
<span data-radar-reading-label>Observed traffic, normalised to 100</span>
```

In `src/experiments/radar-tabs.ts`, use:

```ts
traffic: {
  title: "Traffic",
  description: "Relative HTTP request volume across this country's observed week.",
  guide: "Compare the line with itself: this country's peak is 100. A dip alone does not establish an outage.",
},
bots: {
  title: "Bots",
  description: "Share of HTTP requests likely to be automated.",
  guide: "Likely automated does not mean malicious. This is not a count of AI agents.",
},
devices: {
  title: "Devices",
  description: "Share of requests by device type.",
  guide: "Bars show request share, not unique people. Unclassified devices stay in Other.",
},
protocols: {
  title: "Protocols",
  description: "Share of requests by HTTP version.",
  guide: "Bars show request share. HTTP/3 uses QUIC; this chart does not measure speed or security.",
},
```

- [ ] **Step 4: Write the minimal scenario copy change.**

In `src/experiments/triage-scenarios.ts`, replace only the question and interpretation fields with:

```ts
latency: {
  question: "What could explain the slow requests, and what should be checked next?",
  interpretation: "Database wait is a lead, not a confirmed cause. Check traces and pool measurements. A change after deployment does not prove causation.",
},
telemetry: {
  question: "Why might telemetry be dropping while application health checks still pass?",
  interpretation: "HTTP 429 responses and a collector queue at 85% point to throttling or back-pressure. Passing application checks do not prove telemetry is arriving. The evidence does not show higher traffic or the destination's limit.",
},
replicas: {
  question: "Why are four pods pending when node CPU usage is low? Explain placement, not why HPA chose eight.",
  interpretation: "The scheduler compares resource requests with node capacity. Low measured CPU does not mean requests fit. HPA chooses a target but does not place pods or add nodes. Pending requests and scheduling constraints still need checking.",
},
```

Preserve all evidence values and scenario titles. Do not modify the model prompt, schema, validation or request path.

- [ ] **Step 5: Run the focused Radar and scenario test and verify it passes.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium`

Expected: PASS with the same four Radar tabs, attribution links and three scenario options.

- [ ] **Step 6: Commit the Radar and scenario copy.**

```bash
git add src/components/InternetMap.astro src/experiments/radar-tabs.ts src/experiments/triage-scenarios.ts tests/visual/experiment-copy.spec.ts
git commit -S -m "copy: make Radar and AI guidance concrete"
```

### Task 4: Align experiment documentation

**Files:**

- Modify: `docs/experiments.md:5-13,30-48,81-92`
- Modify: `AGENTS.md` if any copy rule becomes stale

**Interfaces:**

- Consumes: The final component and typed-data wording from Tasks 1 to 3.
- Produces: Current documentation describing the shared copy pattern and the same evidence boundaries.

- [ ] **Step 1: Update the shared-presentation guidance.**

Add the present copy rule after the existing technology-label paragraph:

```md
Supporting copy keeps the title's personality but makes the interaction explicit: the subtitle says what can be changed or started, the next sentence says what to watch, and a short boundary says what the visual does not measure. Keep this rhythm across browser simulations, Radar and Worker-backed cards. Avoid generic explanatory filler.
```

- [ ] **Step 2: Re-read the browser, Radar and Worker-backed tables against source.**

Keep titles, service names, measured-vs-illustrative distinctions, attribution and AI safeguards aligned with the updated components. Remove any sentence that describes wording no longer present. Do not add historical decisions.

- [ ] **Step 3: Run a stale-copy search.**

Run: `rg -n "More replicas|somewhere to put|A different view|A little parallelism|Give it a spin|connection details to a model's second opinion|The daily rhythm of HTTP requests|The devices behind the requests|Which HTTP versions" src docs AGENTS.md`

Expected: no old supporting copy remains except in the design spec, implementation plan, dated history or tests intentionally covering migration.

- [ ] **Step 4: Commit the documentation alignment.**

```bash
git add docs/experiments.md AGENTS.md
git commit -S -m "docs: align experiment copy guidance"
```

### Task 5: Full verification and visual review

**Files:**

- Test: `tests/visual/experiment-copy.spec.ts`
- Test: Existing experiment, Radar, accessibility and typography suites

**Interfaces:**

- Consumes: All copy changes from Tasks 1 to 4.
- Produces: Evidence that copy renders, wraps and remains accessible without changing experiment behaviour.

- [ ] **Step 1: Run unit and static tests.**

Run: `npm test`

Expected: PASS with no changed model, data or Worker behaviour.

- [ ] **Step 2: Run the focused Chromium and WebKit copy suites.**

Run: `npx playwright test tests/visual/experiment-copy.spec.ts --project=chromium --project=webkit`

Expected: PASS for titles, supporting copy, Radar tabs, scenario wording, attribution links and AI labels.

- [ ] **Step 3: Run the complete quality suite.**

Run: `PORTFOLIO_BROWSERS=chromium,webkit npm run quality`

Expected: All existing tests pass in Chromium and WebKit, including mobile layout, accessibility, Radar, live experiments and reduced-motion checks.

- [ ] **Step 4: Inspect narrow and wide layouts in the browser.**

Open `/experiments/` at a desktop viewport and an iPhone-sized viewport. Check that the new lines wrap inside their cards, do not move the preview, do not create new layout shifts and keep the existing staggered rhythm. Open every disclosure and each Radar tab.

- [ ] **Step 5: Check the final diff and working tree.**

Run:

```bash
git diff --check
git status --short --branch
git log -4 --oneline --show-signature
```

Expected: no whitespace errors, only the intended commits, and signed commits visible on the current branch.
