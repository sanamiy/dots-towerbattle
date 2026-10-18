declare module "*.wasm?module" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.png?inline" { const source: string; export default source; }
