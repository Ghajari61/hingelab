// Prototype-pollution guard for the app's own UI, imported before anything else. It lives here
// rather than in Tauri's `freezePrototype` setting, which would also apply to the website view
// (whose libraries assign their own toString and break on a frozen Object.prototype).
// The result is checked so the bundler keeps the call (it treats Object.freeze as side-effect free).
if (!Object.isFrozen(Object.freeze(Object.prototype))) throw new Error("Object.prototype could not be frozen");

export {};
