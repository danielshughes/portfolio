# Design and interaction contract

Use this for the homepage, Notes and shared page elements. [Experiments](experiments.md) owns experiment-specific behaviour; [architecture](architecture.md) owns service and data boundaries.

## Editorial hierarchy

The portfolio is a personal engineering showcase, with distinctive typography and a clear route to substantive work. Content, diagrams and interaction must reinforce the same supported contribution, decision and consequence. Avoid corporate slogans, anonymous project summaries, compulsory three-point structures and repetitive first-person claims. Explain the relevant judgement rather than basic technologies the audience already knows.

The homepage positioning is **Observability, SRE & AI Leader**, with Dan's name secondary. Derive the browser title from the same content value. Keep the headline static and the terminal subtitle immediately below it, above a compact divider. Kubernetes and infrastructure as code remain visible through supported configuration, Helm, Terraform and rollout examples, not an unsupported cluster-ownership claim. The profiling publication example has a transient-error fail-open exception; never describe its normal-path rule check as an unconditional guarantee.

Routes and destination labels agree: `/notes/` is Notes, `/experiments/` is Experiments. Main navigation uses the single words Notes, Experiments, Contact. Unpublished `/work/` and `/playground/` drafts have no compatibility routes; the homepage `#work` anchor is separate. Note anchors describe practices: `observability`, `ai-tooling`, `kubernetes-iac`, `technical-leadership`. Preview links, navigation, article IDs and diagram styles must agree.

The shared footer reads "Always tinkering." Notes and Experiments share the `page-intro` heading treatment, natural wrapping and one introduction divider. Notes has no extra Back home action or duplicate divider; retain the shared home navigation and closing Connect action.

## Rhythm, typography and colour

`src/styles/global.css` owns spacing, responsive heading sizes, font families, weights and body/reading/small/caption/micro roles. Use these roles instead of near-identical one-off values. Fluid editorial headings, diagram-space labels and the monospace subtitle retain purposeful sizing. Keep the first viewport compact, body text readable and illustrations proportionate; enlarged text must grow rather than clip.

Design both light and dark palettes, including the faint shared grid. The grid disappears in forced colours or increased contrast. The theme picker is a visually unframed icon button, subordinate to navigation, with a full 44 px target. Its accessible label identifies the selected preference and next action, including system mode. Preserve system preference, explicit saved overrides and no-script usability.

External Contact, Explore the source and footer View source links open a protected new tab with `rel="noopener noreferrer"` and an accessible new-tab description. Internal navigation stays in the current tab. Use authored SVGs for prominent arrows, avoiding emoji-dependent rendering.

## Homepage artwork and motion

The compact connection graphic belongs beside the introduction on desktop and below it on mobile, not beside the positioning headline. Its caption aligns with the wide drawing. Keep one authored asymmetric arrangement across reloads; randomise pulse origins, not node positions. It is abstract browser-local geometry, not telemetry, and has no heartbeat glyph. Keep it distinct from the waveform experiment.

While visible, pulses move continuously from different nodes with no adjacent automatic origin repeat and one animation-frame chain. Suspend offscreen, in hidden tabs, on page suspension and for reduced motion; resume only when active. Preserve the fixed frame and no-script fallback.

The terminal subtitle shuffles through distinct, source-reviewed phrases with hold/delete/type cycles and a blinking caret. Use the complete phrase set before reuse and avoid adjacent repeats across shuffle boundaries. Reserve phrase geometry to prevent movement. Check visibility and preference gates before queued callbacks change text. Typing and blinking suspend offscreen, hidden and for reduced motion.

Note previews have compact artwork and static captions, with a consistent deliberate hover/keyboard-focus response. There is no entrance reveal for homepage note links. Artwork must not create sticky touch hover or delay first-tap navigation; non-interactive Notes diagrams do not mimic links.

The dh signature redraws on unpressed hover or keyboard-visible focus. The stroke completes after pointer/focus exit; re-entry does not restart it, and its endpoint appears only at completion. A touch tap follows the native home link immediately and redraws on the incoming homepage after its styles load. That navigation skips the page crossfade where supported, preventing an old-page snapshot from covering the live stroke; other navigation keeps its transitions. A one-use, tab-local session flag carries the decorative intent; ordinary refreshes do not replay it. The early page script prevents a complete-mark flash before drawing starts and restores the static fallback if the enhancement fails to load. Reduced motion, blocked storage and no-script navigation keep the complete static mark. Verify touch behaviour in mobile WebKit and on a physical iPhone before claiming the reported Safari issue is resolved. The favicon is the plain dh monogram without accent or underline.

## Accessibility and stable layout

Essential content is static HTML, usable without JavaScript. Prefer native elements and semantic controls; add ARIA for missing meaning, not decoration. Target WCAG 2.2 AA without claiming conformance from automated scores. The owner's omission of subtitle/page-level background-motion pause controls is an explicit accessibility compromise. Keep reduced-motion and visibility gates, readable alternatives and applicable experiment-level controls.

Keep native document scrolling immediate. Global smooth scrolling can animate restored/direct fragments in WebKit and move controls between pointer down and up. Offscreen reveals must not hide content already in view. Preload local fonts and avoid late swaps that move readable content.

Check actual section containment, inter-section gaps, numeric labels and enlarged text, not merely document overflow. Percentage row gaps in intrinsic-height stacked sections cause overlaps; index numbers remain unbroken. Allow fractional DOMRect rounding without accepting visible overlap. Do not assume a wheel delta produces exact movement or a new media query proves existing listeners have updated.

For affected UI, inspect the actual development page and generated build, desktop and mobile, both palettes, keyboard order/focus, landmarks/headings, controls and reduced/no motion. Exercise refresh and restored fragments as well as client navigation. Include iPhone-sized WebKit checks but distinguish them from physical Safari or spoken VoiceOver/NVDA testing. Restart only this project's dev server if a confirmed stale transform prevents verification.
