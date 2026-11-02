/**
 * K6-4 (wave 0.1.86): double-click = word select, not fold toggle.
 *
 * Ink dispatches the DOM click on the FIRST release — before its press-side
 * multi-click detection can run (App.tsx handleMouseEvent: word/line selection
 * is created on press #2+, which then suppresses the DOM click on release).
 * So the fold toggle from click 1 has already happened by the time ink
 * classifies the gesture as a double-click. This module tracks the toggle a
 * click chain produced and reverts it once a second click lands inside the
 * same multi-click window ink uses — every chain ink treats as multi-click
 * ends with a net-zero fold toggle, while a genuine single click still
 * toggles with zero latency (no defer timer).
 */

/** Same window as ink's multi-click detection (App.tsx MULTI_CLICK_TIMEOUT_MS). */
export const FOLD_CLICK_CHAIN_WINDOW_MS = 500;

export type FoldClickChainState = {
  /** Item key of the last DOM click that reached the fold toggle. */
  key: string;
  /** Timestamp of that click (Date.now() at the call site). */
  time: number;
  /** Whether the current chain has a pending toggle that a follow-up click
   *  must revert. Only the fold toggle mutates expandedKeys, so this flag
   *  accurately mirrors the chain's net effect on the fold state. */
  chainNetToggled: boolean;
};

export function newFoldClickChainState(): FoldClickChainState {
  return { key: '', time: 0, chainNetToggled: false };
}

/**
 * Fold one DOM click into the chain state. `toggle` is invoked for every
 * click that must change the fold state; the caller wires it to its
 * setExpandedPaths-style updater.
 */
export function applyFoldClick(
  state: FoldClickChainState,
  key: string,
  now: number,
  toggle: (key: string) => void,
): void {
  const inChain =
    state.chainNetToggled && state.key === key && now - state.time < FOLD_CLICK_CHAIN_WINDOW_MS;
  if (inChain) {
    // Second click of what ink will classify as a multi-click gesture: revert
    // the chain's toggle (net zero — matches ink's click-count semantics where
    // a double-click selects instead of toggling) and go inert for the rest
    // of the chain.
    toggle(key);
    state.chainNetToggled = false;
    state.time = now;
    return;
  }
  const inSettledChain =
    !state.chainNetToggled && state.key === key && now - state.time < FOLD_CLICK_CHAIN_WINDOW_MS;
  if (inSettledChain) {
    // Third+ click inside the same chain window: no-op (the chain's net effect
    // is already zero; ink also ignores click 3+ for fold semantics).
    state.time = now;
    return;
  }
  // New chain: first click, a different item, or the window expired — toggle
  // immediately (zero latency) and arm the revert.
  toggle(key);
  state.key = key;
  state.time = now;
  state.chainNetToggled = true;
}
