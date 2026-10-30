/** The `frontend` object of the Plus handoff that `take_handoff_frontend` serves. */
export type HandoffFrontend = {
  localStorage: Record<string, string>;
  /** database name -> that kv store's entries */
  idb: Record<string, Record<string, unknown>>;
};

/** What `take_handoff_frontend` returns. `overwrite`: Porchlight ran before the move finished, so its own keys give way. */
export type HandoffTake = { frontend: HandoffFrontend; overwrite: boolean };
