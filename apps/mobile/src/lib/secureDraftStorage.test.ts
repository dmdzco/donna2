import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

describe("secure draft storage", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("chunks large drafts and reconstructs them", async () => {
    const { secureDraftStorage } = await import("./secureDraftStorage");
    const draft = "x".repeat(3200);

    await secureDraftStorage.setItem("onboarding draft", draft);

    expect(store.get("onboarding_draft.count")).toBe("3");
    expect(store.get("onboarding_draft")).toBeUndefined();
    await expect(secureDraftStorage.getItem("onboarding draft")).resolves.toBe(draft);
  });

  it("deletes stale chunks when replacing a large draft with a smaller one", async () => {
    const { secureDraftStorage } = await import("./secureDraftStorage");

    await secureDraftStorage.setItem("draft", "x".repeat(3200));
    await secureDraftStorage.setItem("draft", "small");

    expect(store.get("draft.count")).toBe("1");
    expect(store.get("draft.chunk.0")).toBe("small");
    expect(store.has("draft.chunk.1")).toBe(false);
    expect(store.has("draft.chunk.2")).toBe(false);
  });

  it("returns null for incomplete chunk sets", async () => {
    const { secureDraftStorage } = await import("./secureDraftStorage");
    store.set("draft.count", "2");
    store.set("draft.chunk.0", "only-first");

    await expect(secureDraftStorage.getItem("draft")).resolves.toBeNull();
  });

  it("removes legacy and chunked storage keys", async () => {
    const { secureDraftStorage } = await import("./secureDraftStorage");
    await secureDraftStorage.setItem("draft", "x".repeat(1600));

    await secureDraftStorage.removeItem("draft");

    expect([...store.keys()]).toEqual([]);
  });
});
