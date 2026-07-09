// Global test setup. Keep this minimal — per-file mocks live in each test file.

// Some modules read __DEV__ at import time; ensure it is defined under Jest.
if (typeof global.__DEV__ === "undefined") {
  global.__DEV__ = true;
}
