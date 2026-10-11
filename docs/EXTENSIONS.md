# Extensions (design only)

Status: **design, not built** (D121). This describes how third-party plug-ins could add commands to HingeLab Studio without being able to break the editor, read other projects or reach the network unasked. Nothing here ships yet; it fixes the shape of the API so later work can build it in small, safe steps.

## Goals and non-goals

- **Goals:** plug-ins that generate or change geometry (a new box joint, a nesting helper, a custom hatch, an importer for a niche format), written in JavaScript or anything that compiles to it (TypeScript, WebAssembly), installed by the user, and safe to run on a design they care about.
- **Non-goals:** Python or other script interpreters (no CPython, no Pyodide; script extensions from other editors are not loaded, converted or emulated); plug-ins that draw their own UI inside the editor DOM; plug-ins that patch editor code; background plug-ins that run without the user starting them.

## Isolation

Each plug-in runs in its **own dedicated Web Worker**, created from a Blob URL that holds only the plug-in's bundle and our small runtime shim.

- No DOM, no `window`, no access to the editor's stores, IndexedDB, cookies or `localStorage` (workers created from Blob URLs on our origin get no storage we hand them; the shim deletes `indexedDB`, `caches` and `importScripts` before the plug-in code runs).
- **Network off by default:** the worker is started under a Content-Security-Policy with `connect-src 'none'`; the shim also replaces `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` with functions that throw. Network access exists only through the `net` permission below, proxied by the editor.
- **Time and memory limits:** every call has a deadline (default 10 s, the user can allow longer per plug-in). On timeout the editor calls `worker.terminate()`; the document is untouched because results are applied only after a call finishes. Message payloads are capped (default 64 MB) and geometry is capped by node count.
- **No shared memory:** messages are structured clones; `SharedArrayBuffer` is not offered.
- A crashed or terminated plug-in never leaves a half-applied change: the editor applies a plug-in's result as **one undoable step** through the same `edit()` path every built-in command uses, after validating it.

## Message API

All traffic is `postMessage` with versioned, typed envelopes. The plug-in never sees editor objects, only plain JSON-safe data in millimetres.

```ts
// editor → plug-in
type ToPlugin =
  | { v: 1; kind: "hello"; api: "1.x"; locale: string; units: "mm" | "cm" | "in" | "pt" | "px" }
  | { v: 1; kind: "run"; call: number; command: string; params: Record<string, unknown>; input?: PluginInput }
  | { v: 1; kind: "cancel"; call: number };

// plug-in → editor
type FromPlugin =
  | { v: 1; kind: "ready"; commands: PluginCommand[] }
  | { v: 1; kind: "progress"; call: number; done: number; total: number; note?: string }
  | { v: 1; kind: "result"; call: number; ops: PluginOp[] }
  | { v: 1; kind: "error"; call: number; message: string };

interface PluginInput {
  selection: PlainObject[];       // paths/shapes as subpaths in world mm, with id, name, cut layer
  sheet: { w: number; h: number };
  cutLayers: { index: number; name: string; mode: "cut" | "score" | "fill" | "image" }[];
}

type PluginOp =
  | { op: "add"; object: PlainObject; layer?: number }                  // new path or group
  | { op: "replace"; id: string; object: PlainObject }                  // only ids it was given
  | { op: "remove"; id: string }                                        // only ids it was given
  | { op: "select"; ids: string[] };
```

- `PlainObject` is a path or a group of paths: `{ type: "path", subpaths: { closed, nodes: { x, y, i?, o? }[] }[], name? }`. Live shapes, text, clones and Live Effects are passed as their outlines; a plug-in cannot see or create them in API 1.
- The editor validates every op (finite numbers, node and depth limits, ids that were in the input, layer index 0–29) and rejects the whole result if one op is invalid.
- A command's parameters are declared in the manifest (number with unit and range, integer, choice, boolean, text) and the editor renders the dialog itself, with our own components, so plug-ins cannot spoof UI. A preview runs the same call with `preview: true` and shows the result as a live preview (`begin` / `preview` / `end`), exactly like the built-in path dialogs.

## Permission scopes

Asked for in the manifest, shown at install, granted per plug-in, revocable in Preferences ▸ Extensions. A call that needs an ungranted scope fails with a clear error.

| Scope | Allows |
|---|---|
| `selection:read` | Receive the selected objects' outlines (default for every geometry plug-in). |
| `document:read` | Receive every visible object's outline, not only the selection. |
| `document:write` | Return `add` ops. `replace` / `remove` also need `selection:read` or `document:read` (only ids it received). |
| `layers:read` | Receive cut-layer names and modes (never speeds or powers). |
| `assets:read` | Receive the bitmap of a selected image (as RGBA, downscaled), e.g. for a tracer. |
| `file:import` | Be offered a file the user picked in an Open dialog the editor shows. |
| `net:<host>` | `fetch` through the editor to exactly that HTTPS host; requests and responses are logged in the plug-in's details page. |

There is no scope for other projects, the account, billing, cloud storage, settings or the clipboard.

## Manifest

```json
{
  "id": "com.example.finger-joints",
  "name": "Finger joints",
  "version": "1.2.0",
  "api": "1",
  "entry": "plugin.js",
  "author": { "name": "Example Ltd", "url": "https://example.com" },
  "licence": "MIT",
  "permissions": ["selection:read", "document:write"],
  "commands": [
    {
      "id": "add-fingers",
      "label": "Add Finger Joints…",
      "menu": "Extensions",
      "keywords": "box joint tab slot",
      "params": [
        { "id": "width", "type": "length", "label": "Finger width", "default": 8, "min": 1, "max": 100 },
        { "id": "kerf", "type": "length", "label": "Kerf", "default": 0.1, "min": 0, "max": 2 }
      ]
    }
  ],
  "limits": { "timeoutMs": 10000 }
}
```

Command ids are namespaced as `ext.<plugin id>.<command id>` in the command registry, so they appear in menus and the command palette, can get shortcuts, and can never collide with built-in commands.

## Versioning

- **API version** (`"api": "1"`): the message format and op set. Additive changes (new optional fields, new op kinds a plug-in can ignore) keep the major version; anything else is API 2, and the editor keeps running API-1 plug-ins through an adapter for at least a year.
- **Plug-in version:** semver. An update that asks for **new permissions** is not applied until the user accepts them.
- The `hello` message tells the plug-in the editor's API range; a plug-in that needs a newer API is shown as "needs a newer HingeLab" and not started.

## Distribution and signing

- Plug-ins are a zip (`.hlx`) of the manifest, the bundle and an optional icon (SVG, sanitised) and README.
- **Signed:** the package carries an Ed25519 signature over the manifest and a SHA-256 of every file. A listing in the HingeLab extension directory is signed with our directory key after review (automated checks for forbidden APIs and bundle size, plus a human review of the permissions). Directory plug-ins install with one click and update automatically within their granted permissions.
- **Unsigned / side-loaded** packages can be installed only after turning on Developer mode in Preferences, show a permanent "unsigned" badge, never auto-update, and get no `net:*` scope.
- We can revoke a directory signature; revoked plug-ins are disabled on next start with an explanation.
- Plug-in licences must be OSI-approved or proprietary-with-permission; plug-ins are the author's code, not ours, and are not bundled into the app.

## Built-in safety checks (all plug-ins)

- Results go through the same pre-flight as path operations (open paths, lines cut twice) before the user sees them.
- Every plug-in step is undoable and labelled with the plug-in's name in History.
- Exports never contain plug-in metadata.

## Order of work (when we build it)

1. Runtime shim + worker host + message validation, with one in-repo sample plug-in; no install UI.
2. Manifest parsing, permission prompts, Preferences ▸ Extensions, side-loading in Developer mode.
3. Parameter dialogs with live preview; command registry and palette integration.
4. Signing, directory, updates, revocation.
