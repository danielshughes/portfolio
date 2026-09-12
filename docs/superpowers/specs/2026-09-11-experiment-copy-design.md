# Experiment copy: concrete supporting language

## Status

Historical design, implemented. Retained for the rationale behind concrete
supporting copy and unchanged titles. The [experiment contract](../../experiments.md)
owns current guidance; the proposed wording below is not a second source of truth.

## Goals

- Keep the page playful and recognisable by retaining every card title.
- Make each subtitle say what the visitor can change or start.
- Make the first explanatory sentence say what the visitor should watch.
- Use plain British English, with short sentences and no em dashes.
- Keep the implementation and provenance limits visible without turning cards
  into documentation.
- Use the same copy rhythm for browser simulations, Radar and live Workers
  experiments.

## Shared copy pattern

Each card keeps this order:

1. Existing title, unchanged.
2. A concrete subtitle describing the interaction or input.
3. One short sentence describing the visible result.
4. The existing shared technology line.
5. A caption or boundary sentence that says what the visual is and is not.

The technology line remains outside Explore. It names only implemented services,
runtime APIs or browser renderers. The copy must not imply a real cluster,
production scale, service discovery, network routing, uptime monitoring or
model certainty where none exists.

## Proposed copy map

### Browser simulations

| Card                      | Supporting copy                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Room for one more?        | Subtitle: “Raise CPU demand and watch the replica target change, then see which pods fit.” Body: “Turn up CPU demand. HPA changes the target, then the scheduler tries to place each pod.” Output: “HPA sets the replica target. Placement uses each pod's CPU request, so a pod can stay pending when there is no room.”                                                                        |
| Who's allowed to do what? | Subtitle: “Choose a scenario, set the call budget and decide whether a simulated write is allowed.” Body: “Follow the scripted agent as it checks context, calls tools and stops at a timeout, missing context or denied write.” Output: “The script proposes a call. The host checks context, budget and approval before a simulated write.” Change the disclosure label to “Follow the trace”. |
| A little interference.    | Subtitle: “Compare a clean wave with the same wave after interference is added.” Body: “The upper trace stays clean. Change the lower trace's noise, frequency and amplitude.” Caption: “Synthetic waves. The upper trace is the reference; the lower trace has added interference.”                                                                                                             |
| The average looks fine.   | Subtitle: “Keep most requests steady, then stretch the slowest ten.” Body: “Move the tail slider and watch the median stay put while the slow end grows.” Output: “The median stays steady; the slowest requests move the upper percentiles.”                                                                                                                                                    |
| Requests in flight.       | Subtitle: “Change how many requests run together and see which finish before the deadline.” Body: “Run the lookup with a different number in flight. Queued time counts against the deadline.” Replace the static output with: “The readout will show how many of 12 requests meet the deadline.”                                                                                                |
| A small connected world.  | Subtitle: “Rotate the graph or select a node to see its direct connections.” Body: “Drag to rotate. Select a node to highlight its neighbours and dim the rest.” Change the disclosure label to “See the connections”.                                                                                                                                                                           |

Existing footnotes remain the source of quantitative and simulation limits. Only
shorten one when the replacement says the same thing more clearly.

### Radar atlas

Change the heading subtitle to: “Pick a country and scrub through its observed
week.” Change the reading label to: “Observed traffic, normalised to 100”.
Other views use similarly explicit labels: “Observed automated share”, “Observed
device share” and “Observed HTTP version share”.

Use these tab descriptions and guides:

| View      | Description                                                         | Guide                                                                                                 |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Traffic   | “Relative HTTP request volume across this country's observed week.” | “Compare the line with itself: this country's peak is 100. A dip alone does not establish an outage.” |
| Bots      | “Share of HTTP requests likely to be automated.”                    | “Likely automated does not mean malicious. This is not a count of AI agents.”                         |
| Devices   | “Share of requests by device type.”                                 | “Bars show request share, not unique people. Unclassified devices stay in Other.”                     |
| Protocols | “Share of requests by HTTP version.”                                | “Bars show request share. HTTP/3 uses QUIC; this chart does not measure speed or security.”           |

Keep the event, attribution, licence and transformation wording. “No reported
events” must continue to be distinct from “no outage”. The map remains labelled
as country markers, not network routes.

### Live Workers experiments

Use “A few live requests” as the eyebrow and keep “Outside the browser.” as the
section heading. Replace the section introduction with: “These cards make bounded
requests to Cloudflare, then show exactly what comes back.”

| Card              | Supporting copy                                                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| You are here.     | Subtitle: “Your request, at the edge.” Caption: “Illustration; open to inspect the metadata returned for this request.” Keep the approximate-country and no-IP boundary.                                                                                                                                              |
| Still answering?  | Subtitle: “A day of scheduled checks, including gaps.” Caption: “Scheduled checks; open to inspect recorded response headers.” Keep the distinction between observed checks, missing rows and failed checks.                                                                                                          |
| Bit by bit.       | Subtitle: “Start a response and watch six chunks arrive.” Caption: “Illustration; run it to receive six real chunks.” Keep the buffering and no-speed-test boundary.                                                                                                                                                  |
| On the same page. | Subtitle: “Connect two windows and send a numbered pulse between them.” Caption: “Shared sequence; connect to send a real pulse.” Keep the illustrative-travel and no-message boundary.                                                                                                                               |
| A second opinion. | Subtitle: “Choose a fictional incident and get a hypothesis, two checks and the unknowns.” Replace the reference footnote with: “This is the authored baseline for comparison. The model sees only the selected facts and question.” Keep the existing model, Turnstile, D1, no-tools and no-live-systems boundaries. |

The generated answer labels stay: “Model suggestion”, “A possible explanation”,
“Suggested read-only checks” and “Still unknown”. They already describe the
answer shape without claiming a diagnosis.

### Scenario wording

Keep the scenario titles. Make the questions and interpretations shorter while
preserving their evidence limits:

- The slow tail: “What could explain the slow requests, and what should be
  checked next?” Database wait is a lead, not a confirmed cause. Check traces
  and pool measurements. A change after deployment does not prove causation.
- The quiet dashboard: “Why might telemetry be dropping while application
  health checks still pass?” HTTP 429 responses and a collector queue at 85%
  point to throttling or back-pressure. Passing application checks do not prove
  telemetry is arriving. The evidence does not show higher traffic or the
  destination's limit.
- Nowhere to land: “Why are four pods pending when node CPU usage is low?
  Explain placement, not why HPA chose eight.” The scheduler compares resource
  requests with node capacity. Low measured CPU does not mean requests fit. HPA
  chooses a target but does not place pods or add nodes. Pending requests and
  scheduling constraints still need checking.

Evidence values remain authored facts. Do not add measurements, completed
checks, causes or operational ownership.

## Non-goals

- No title changes.
- No new experiments, controls, animations or API calls.
- No claims about employment, production ownership, scale or certification.
- No removal of Radar attribution or AI safety disclosures.
- No attempt to control the wording of generated model output beyond the
  existing structured schema and prompt limits.

## Verification

- Search all experiment-facing Astro, TypeScript and Markdown for the old
  supporting strings and update every duplicate.
- Keep copy assertions aligned with the chosen titles and labels.
- Run the full Chromium and WebKit quality suite.
- Check the first viewport and narrow mobile widths for wrapping and stable
  card geometry.
- Read the updated `docs/experiments.md` against the implementation so the
  documented behaviour and visible copy agree.
