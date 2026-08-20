import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import { inspectStoredFile } from "../lib/fileStorage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stored-file diagnostics", () => {
  it("identifies an absent file using ENOENT", () => {
    const diagnostic = inspectStoredFile("/tmp/paper-that-does-not-exist.pdf");

    expect(diagnostic.exists).toBe(false);
    expect(diagnostic.errorCode).toBe("ENOENT");
  });

  it("keeps a permission failure distinct from a missing file", () => {
    const permissionError = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    vi.spyOn(fs, "statSync").mockImplementation(() => {
      throw permissionError;
    });

    const diagnostic = inspectStoredFile("/tmp/protected-paper.pdf");

    expect(diagnostic.exists).toBeNull();
    expect(diagnostic.errorCode).toBe("EACCES");
  });
});