/** Stubs satellite.js WASM runtimes so Vite never bundles the pthreads worker. */
export default async function createWasmModule() {
  throw new Error("satellite.js wasm is disabled in this build");
}
