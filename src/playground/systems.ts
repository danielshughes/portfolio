import {
  agentTrace,
  planCluster,
  type Decision,
  type Scenario,
} from "./simulations";
import { playback } from "./playback";

export function mountSystem(root: HTMLElement) {
  const controls = root.querySelector<HTMLElement>(".experiment-controls")!;
  const chart = root.querySelector<SVGSVGElement>(".system-chart")!;
  const output = root.querySelector("output")!;
  controls.hidden = false;
  if (root.dataset.experiment === "kubernetes") {
    const inputs = [...controls.querySelectorAll<HTMLInputElement>("input")];
    const defaults = inputs.map((input) => input.value);
    let state = planCluster({
      load: 1200,
      cpuRequest: 500,
      target: 60,
      nodes: 2,
    });
    const player = playback(
      root,
      (progress) => {
        const pending = state.assignments.filter(
          (node) => node === null,
        ).length;
        const step =
          progress < 0.2
            ? "HPA: calculate target"
            : progress < 0.4
              ? "Controllers: reconcile pods"
              : progress < 1
                ? "Scheduler: find a fit"
                : pending
                  ? `${pending} pod${pending === 1 ? "" : "s"} still pending`
                  : "All pods placed";
        const width = 540 / state.nodes;
        const slots = Array<number>(state.nodes).fill(0);
        const nodes = state.used
          .map(
            (cpu, i) =>
              `<rect class="node" x="${30 + i * width}" y="115" width="${width - 14}" height="175" rx="4"/><text x="${40 + i * width}" y="138">node ${i + 1}</text><text x="${40 + i * width}" y="278" style="font-size:12px">${Math.round((cpu / 2000) * 100)}% booked</text>`,
          )
          .join("");
        const pods = state.assignments
          .map((node, i) => {
            const fromX = 30 + i * 45,
              fromY = 69;
            const slot = node === null ? 0 : slots[node]++;
            const toX =
              node === null
                ? fromX
                : 41 + node * width + ((slot % 3) * (width - 38)) / 3;
            const toY = node === null ? fromY : 154 + Math.floor(slot / 3) * 25;
            const t = Math.max(
              0,
              Math.min(1, (progress - 0.4 - i * 0.025) / 0.25),
            );
            const ease = t * t * (3 - 2 * t);
            return `<rect class="${node === null ? "pending" : "pod"}" x="${fromX + (toX - fromX) * ease}" y="${fromY + (toY - fromY) * ease}" width="22" height="18" rx="2"/>`;
          })
          .join("");
        chart.innerHTML = `<text class="step-text" x="30" y="25">${step}</text><text x="30" y="53">Target ${state.desired} pods / pending queue ↓</text>${nodes}${pods}`;
      },
      3200,
    );
    function update() {
      const [load, cpuRequest, target, nodes] = inputs.map((input) =>
        Number(input.value),
      );
      state = planCluster({ load, cpuRequest, target, nodes });
      inputs.forEach((input) =>
        input.setAttribute(
          "aria-valuetext",
          input.value +
            (input.name === "nodes"
              ? ` node${Number(input.value) === 1 ? "" : "s"}`
              : input.name === "target"
                ? " percent"
                : " millicores"),
        ),
      );
      const pending = state.assignments.filter((node) => node === null).length;
      output.textContent = `Result: ${state.desired} desired pod${state.desired === 1 ? "" : "s"}, ${state.desired - pending} placed, ${pending} pending. CPU utilisation in the initial snapshot: ${Math.round(state.utilisation)}%. ${nodes} node${nodes === 1 ? "" : "s"}, ${cpuRequest}m requested per pod.`;
      player.replay();
    }
    inputs.forEach((input) => input.addEventListener("input", update));
    controls.querySelector("[data-reset]")!.addEventListener("click", () => {
      inputs.forEach((input, i) => (input.value = defaults[i]));
      update();
    });
    update();
    return;
  }
  const scenarios = [
    ...controls.querySelectorAll<HTMLInputElement>("[name=scenario]"),
  ];
  const budget = controls.querySelector<HTMLInputElement>("[name=budget]")!;
  const approval = controls.querySelector<HTMLElement>(".approval-actions")!;
  const list = root.querySelector<HTMLOListElement>(".trace-list ol")!;
  let decision: Decision = "waiting";
  let trace = agentTrace("read", 3, decision);
  let shown = -1;
  const player = playback(
    root,
    (progress) => {
      const index = Math.min(
        trace.length - 1,
        Math.floor(progress * trace.length),
      );
      const step = trace[index];
      const active = ["context", "agent", "tool", "result"].indexOf(step.stage);
      const hostActive = ["approval", "stopped", "timeout"].includes(
        step.stage,
      );
      const points = [65, 215, 385, 535];
      chart.innerHTML =
        `<path class="route" d="M65 125H535M215 125V240H385V125"/>` +
        points
          .map(
            (x, i) =>
              `<circle class="node ${i === active ? "active" : ""}" cx="${x}" cy="125" r="38"/><text text-anchor="middle" x="${x}" y="130">${["context", "agent", "tools", "result"][i]}</text>`,
          )
          .join("") +
        `<rect class="node ${hostActive ? "active" : ""}" x="235" y="220" width="130" height="40" rx="4"/><text x="300" y="245" text-anchor="middle">host policy</text><text x="30" y="30">Step ${index + 1} / ${trace.length} · ${step.calls} / ${budget.value} calls</text>` +
        Array.from(
          { length: Number(budget.value) },
          (_, i) =>
            `<rect class="${i < step.calls ? "budget" : "node"}" x="${30 + i * 28}" y="290" width="18" height="8"/>`,
        ).join("");
      if (index === shown) return;
      shown = index;
      [...list.children].forEach((item, i) => {
        if (i === index) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
    },
    6500,
  );
  function update(resetDecision = true) {
    if (resetDecision) decision = "waiting";
    const scenario = scenarios.find((input) => input.checked)!
      .value as Scenario;
    trace = agentTrace(scenario, Number(budget.value), decision);
    budget.setAttribute("aria-valuetext", budget.value + " tool calls maximum");
    list.replaceChildren(
      ...trace.map((step) => {
        const item = document.createElement("li");
        item.textContent = step.text;
        return item;
      }),
    );
    const result = trace.at(-1)!;
    output.textContent = `Result: ${result.text} ${result.calls} of ${budget.value} tool calls used.`;
    approval.hidden = !(result.stage === "approval" && decision === "waiting");
    shown = -1;
    player.replay();
  }
  scenarios.forEach((input) =>
    input.addEventListener("change", () => update()),
  );
  budget.addEventListener("input", () => update());
  controls.querySelector("[data-approve]")!.addEventListener("click", () => {
    decision = "approve";
    update(false);
    output.tabIndex = -1;
    output.focus({ preventScroll: true });
  });
  controls.querySelector("[data-deny]")!.addEventListener("click", () => {
    decision = "deny";
    update(false);
    output.tabIndex = -1;
    output.focus({ preventScroll: true });
  });
  controls.querySelector("[data-reset]")!.addEventListener("click", () => {
    scenarios[0].checked = true;
    budget.value = "3";
    update();
  });
  update();
}
