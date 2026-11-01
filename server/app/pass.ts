// One rule for every background pass: a pass runs once at a time, answers with
// the same four frame fields, and a break-off carries a reason.
//
// A pass keeps its own counters, folders, pages, titles, in the state object it
// hands to start. The frame around those counters is what the windows read, so
// the running flag and the reason of a break-off mean the same everywhere.

export type Frame = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type Pass<T extends Frame> = {
  /** The state as it stands: the live object, so a pass may write into it. */
  state(): T;

  /**
   * Takes the pass for one run. A live pass returns false, the answer the
   * endpoints give for a second press. `done` runs after the frame closed, the
   * place where a pass publishes its end.
   */
  start(work: (state: T) => unknown, done?: (state: T) => void): boolean;

  /** Puts the state back to the empty frame, the shape a fresh process starts
      with. */
  reset(): void;
};

const textOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** Builds one pass handle over a state made by empty(). */
export function passOf<T extends Frame>(empty: () => T): Pass<T> {
  let state = empty();

  return {
    state: () => state,

    start: (work, done) => {
      if (state.running) return false;

      const now = new Date().toISOString();
      state = { ...empty(), running: true, startedAt: now, finishedAt: null, error: null };

      void Promise.resolve()
        .then(() => work(state))
        .catch((cause: unknown) => {
          // An error field still empty takes the message of the throw as its
          // reason.
          state.error ??= textOf(cause);
        })
        .finally(() => {
          state.running = false;
          state.finishedAt = new Date().toISOString();
          done?.(state);
        });

      return true;
    },

    reset: () => {
      state = empty();
    },
  };
}
