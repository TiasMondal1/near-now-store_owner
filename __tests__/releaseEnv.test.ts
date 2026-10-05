/* eslint-disable @typescript-eslint/no-require-imports */
const { positionalArgs, resolveReleaseEnvironment } = require("../scripts/release-env");

describe("resolveReleaseEnvironment — releases are production unless asked", () => {
  it.each([
    [[], "production"],
    [["aab"], "production"],
    [["--env=preview"], "preview"],
    [["aab", "--env", "preview"], "preview"],
    [["--env=production", "--alias=x"], "production"],
  ])("%j → %s", (argv, expected) => {
    expect(resolveReleaseEnvironment(argv)).toBe(expected);
  });

  it.each([["--env=development"], ["--env=prod"], ["--env="]])("rejects %s", (flag) => {
    expect(() => resolveReleaseEnvironment([flag])).toThrow(/Unknown --env/);
  });
});

describe("positionalArgs — the apk/aab target, not a flag's value", () => {
  it.each([
    [["aab"], ["aab"]],
    [["--env", "preview", "aab"], ["aab"]],
    [["--alias", "app_release"], []],
    [["--arch=arm64-v8a", "aab", "--alias=x"], ["aab"]],
    [["--arch", "armeabi-v7a"], []],
  ])("%j → %j", (argv, expected) => {
    expect(positionalArgs(argv)).toEqual(expected);
  });
});
