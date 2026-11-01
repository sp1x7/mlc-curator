// The frame a background pass rides in: one at a time, its four fields, and the reason
// of a break-off.

import { describe, expect, test } from "bun:test";
import { type Frame, passOf } from "@server/app/pass";

type Counted = Frame & { folders: number };

// The frame with every field cleared.
const empty = (): Counted => ({
  running: false,
  startedAt: null,
  finishedAt: null,
  error: null,
  folders: 0,
});

/** One turn of the event loop: the turn the pass needs to start its work. */
const tick = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** A pass that ends when the test says so. */
function held() {
  let done: () => void = () => {};
  const work = (): Promise<void> => new Promise<void>((resolve) => (done = resolve));

  return { work, finish: () => done() };
}

describe("the frame of a pass", () => {
  test("a pass that runs is never taken twice", async () => {
    const pass = passOf<Counted>(empty);
    const heldPass = held();

    expect(pass.start(heldPass.work)).toBe(true);
    expect(pass.start(empty)).toBe(false);
    expect(pass.state().running).toBe(true);

    // The work starts one turn later; before that turn it has zero chance to finish.
    await tick();
    heldPass.finish();
    await tick();

    expect(pass.state().running).toBe(false);
    expect(pass.start(empty)).toBe(true);
  });

  test("the counters of the pass before are gone, the frame is stamped", async () => {
    const pass = passOf<Counted>(empty);

    pass.start((state) => {
      state.folders = 12;
    });
    await tick();
    expect(pass.state().folders).toBe(12);

    pass.start(() => {});
    expect(pass.state().folders).toBe(0);
    expect(pass.state().startedAt !== null).toBe(true);
    expect(pass.state().finishedAt).toBeNull();

    await tick();
    expect(pass.state().finishedAt !== null).toBe(true);
  });

  test("a pass that breaks names its reason and leaves the frame free", async () => {
    const pass = passOf<Counted>(empty);

    pass.start(() => {
      throw new Error("board nicht erreichbar");
    });
    await tick();

    expect(pass.state().error).toBe("board nicht erreichbar");
    expect(pass.state().running).toBe(false);
    expect(pass.state().finishedAt !== null).toBe(true);
  });

  test("a reason the pass named itself stands", async () => {
    const pass = passOf<Counted>(empty);

    pass.start(async (state) => {
      state.error = "forum 12 fehlt";
      throw new Error("irgendwas anderes");
    });
    await tick();

    expect(pass.state().error).toBe("forum 12 fehlt");
  });

  test("the close runs after the frame stopped running", async () => {
    const pass = passOf<Counted>(empty);
    const seen: boolean[] = [];

    pass.start(
      () => {},
      (state) => seen.push(state.running),
    );
    await tick();

    expect(seen).toEqual([false]);
    expect(pass.state().running).toBe(false);
  });

  test("a reset is a restart: nothing has run", async () => {
    const pass = passOf<Counted>(empty);

    pass.start((state) => {
      state.folders = 3;
    });
    await tick();

    pass.reset();
    expect(pass.state()).toEqual(empty());
    expect(pass.state().running).toBe(false);
  });
});
