/** The `frontend` object of the Plus handoff that `take_handoff_frontend` serves. */
export type HandoffFrontend = {
  localStorage: Record<string, string>;
  /** database name -> that kv store's entries */
  idb: Record<string, Record<string, unknown>>;
};
