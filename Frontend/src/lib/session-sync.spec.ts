import { describe, expect, it } from "vitest";

import { requestResync, setResyncHandler } from "./session-sync";

describe("session-sync", () => {
  it("resolve false tanpa handler terdaftar (SSR/test)", async () => {
    setResyncHandler(null);
    await expect(requestResync()).resolves.toBe(false);
  });

  it("meneruskan hasil handler", async () => {
    setResyncHandler(async () => true);
    await expect(requestResync()).resolves.toBe(true);
    setResyncHandler(async () => false);
    await expect(requestResync()).resolves.toBe(false);
    setResyncHandler(null);
  });

  it("handler yang reject/throw dianggap tidak berubah, bukan error", async () => {
    setResyncHandler(() => Promise.reject(new Error("boom")));
    await expect(requestResync()).resolves.toBe(false);
    setResyncHandler(() => {
      throw new Error("boom");
    });
    await expect(requestResync()).resolves.toBe(false);
    setResyncHandler(null);
  });
});
