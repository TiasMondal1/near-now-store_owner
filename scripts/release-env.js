/**
 * Argument handling for scripts/build-apk-with-env.js, kept separate so it
 * can be unit-tested (__tests__/releaseEnv.test.ts).
 *
 * A release build is a production build unless asked otherwise: the local
 * .env usually says EXPO_PUBLIC_ENV=development (right for `expo start`), and
 * baking that into a release once shipped the developer tools to real
 * shopkeepers (2026-10-05 review). `--env=preview` builds a tester release.
 */
const RELEASE_ENVIRONMENTS = ["production", "preview"];

/** Flags that take a value, in either --flag=value or --flag value form. */
const VALUE_FLAGS = ["--arch", "--reactNativeArchitectures", "--alias", "--env"];

/** The environment baked into this release build. Throws on an unknown one. */
function resolveReleaseEnvironment(argv) {
  let env = "production";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--env=")) env = a.slice("--env=".length);
    else if (a === "--env" && argv[i + 1]) env = argv[++i];
  }
  if (!RELEASE_ENVIRONMENTS.includes(env)) {
    throw new Error(`Unknown --env "${env}". Use one of: ${RELEASE_ENVIRONMENTS.join(", ")}.`);
  }
  return env;
}

/** Positional arguments (the apk / aab target), skipping flag values. */
function positionalArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.includes(a)) {
      i++;
      continue;
    }
    if (!a.startsWith("-")) out.push(a);
  }
  return out;
}

module.exports = { RELEASE_ENVIRONMENTS, resolveReleaseEnvironment, positionalArgs };
