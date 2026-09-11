import { runtime } from "../tests/runtime-harness.mjs";
const mf = await runtime({ port: 4322, bindings: { RADAR_ENABLED: false } });
console.log("Local fixture Worker ready on port 4322");
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void mf.dispose().then(() => process.exit(0));
  });
