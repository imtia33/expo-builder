# 05 — Flow System

> Flows give components behavior: "a sign in button does multiple things — send the
> email/pass to server, receive, then route to screen X." Users pick sync or async
> steps. The same flow spec drives **simulation** (canvas) and **export** (codegen).

## 1. Model

A **flow** is attached to a component's **flow hook** (an event prop from the registry:
`onPress`, `onPressIn`, `onTextChange`, `onRefresh`, `onValueChange`, `onFocus`…).

```ts
interface Flow {
  id: string
  hook: string                    // 'onPress'
  steps: FlowStep[]               // ordered chain
  errorPolicy: 'inline' | 'catch-all'  // how failure paths are authored
}

interface FlowStep {
  id: string
  action: BehaviorActionId        // registry §4: api-call, router.navigate, state.set, ...
  config: Record<string, Binding> // action params; values may be bindings
  onSuccess?: string              // step id to jump to (default: next)
  onError?: string                // failure path step id (required for async actions)
}

type Binding =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'ref'; path: string }        // {{props.email}} {{state.form.busy}} {{steps.callRes.token}} {{screen.params.id}}
```

- **Sync steps** (state.set, haptics, alert, router.navigate…) run in order.
- **Async steps** (api-call, biometric, image-picker…) resolve; their result fields
  are addressable by later steps (`{{steps.<id>.<field>}}`) and by codegen bindings.
- Every async step MUST have an `onError` target (or flow-level catch-all → alert).
  Gate G15 blocks export of flows missing error paths.

## 2. Behavior actions (registry §4 — 16 in v1)

api-call (fetch/axios flavors) · storage.get/set (AsyncStorage/MMKV flavors) ·
secure-store.get/set · haptics · notifications.schedule · share · clipboard ·
location.get · biometric.authenticate · router.navigate/replace/back ·
state.set/get · alert · image-picker · web-browser.open · toast.

Each action in the registry carries: param schema (for the Flow tab editor),
result schema (for bindings), simulation behavior, and the exact codegen emission
(`06-codegen.md` §4).

## 3. State

- **Flow-scoped state** (loading flags, form data): declared on the flow editor as
  typed state entries; emitted as `useState` (React state) by default, or as
  `useSharedValue` when bound to an animation (policy table: `06-codegen.md` §4).
- **App-level state** (cross-screen, e.g. session token): project-scoped store
  entries; emitted as a tiny zustand store in `src/state/` — zustand is a registry-
  approved package and needs zero native code.

## 4. Simulation runtime

The same step chain executes on the canvas when Sim mode is on:

1. Hook fires (real RNW event, e.g. `onPress` from the live tree).
2. Runtime resolves bindings against the current tree + state + prior step results.
3. Async actions hit the **mock API layer** (§6); latency and response per spec.
4. `router.navigate` swaps the active screen inside the artboard via the mini
   router runtime (screen stack with params; back gesture = toolbar button in v1).
5. State updates re-render the live tree (e.g. loading flag shows the button's
  `:active`/disabled look; spinner text swaps).
6. Flow errors surface as simulated alerts/toasts — exactly what export emits.

**No second implementation:** the runtime consumes `Flow` objects; codegen consumes
the same objects. If a step can't simulate faithfully (e.g. biometric), the registry
marks it `sim: 'approximated'` and the UI badges it ("device-only behavior").

## 5. Editing UX (right panel → Flow tab)

- Hook selector (only registry flow hooks for the selected component).
- Step list: add from action palette; drag to reorder; per-step config form
  (schema-driven); binding fields accept `{{...}}` via autocomplete over
  available refs (props → state → steps → screen.params → app state).
- Success/error path arrows (compact list rendering, v1 — not a node graph canvas).
- "Test run" button per flow (executes once in Sim mode, logs to a console drawer).
- Multi-selection: Flow tab disables (flows are per-component).

## 6. Mock API layer

- Declared in the Flow tab when the first `api-call` is added: endpoint table
  (method, path, latency profile, response shape, error shape + rate).
- Default latency profile: randomized 200–800ms (OPEN QUESTION in `06-codegen.md`
  appendix — finalize before beta; simulation uses the same profile).
- Codegen emits `src/api/mock.ts` (typed, seeded from the same table) + switches to
  real endpoints by setting `API_BASE_URL` — no flow edits needed.
- Flows bind to **endpoints**, not raw URLs: changing the endpoint table updates
  simulation and export atomically.

## 7. Codegen mapping (summary — full rules in `06-codegen.md` §4)

- Flow → named async handler (`const handleSignIn = async () => { ... }`) attached
  to the hook prop; try/catch/finally always emitted.
- Step → awaited call in order; `onSuccess/onError` → control flow (`if`/`try`).
- Bindings → template literals / direct refs; state entries → `useState` or
  `useSharedValue` per policy table; app state → zustand store module.
- Step results → local consts; unused results are tree-shaken by gate G1.
