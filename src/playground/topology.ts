// One undirected, imaginary graph for the canvas, controls and readable list.
export const nodes = [
  { name: "Browser", point: [-1.5, 0.4, 0.5] },
  { name: "API", point: [-0.5, -0.7, -0.6] },
  { name: "Queue", point: [1, -0.8, 0.4] },
  { name: "Worker", point: [1.5, 0.6, -0.5] },
  { name: "Store", point: [0.2, 1, 0.8] },
  { name: "Cache", point: [-1.3, 0.8, -1] },
];
export const edges = [
  [0, 1],
  [0, 5],
  [1, 2],
  [1, 4],
  [2, 3],
  [3, 4],
];
export const connections = nodes.map(
  (node, index) =>
    `${node.name}: ${edges
      .filter(([a, b]) => a === index || b === index)
      .map(([a, b]) => nodes[a === index ? b : a].name)
      .join(", ")}`,
);
