export function useAfterFirstRender(): void {
  // de-ANT: the ant-only "exit after first render" startup check was removed;
  // this hook is now a no-op (kept so call sites are unchanged).
}
