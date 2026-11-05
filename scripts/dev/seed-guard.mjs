/**
 * @param {{ nodeEnv: string | undefined, dbUrl: string | undefined }} target
 * @returns {string | null} a refusal message, or null when seeding is allowed
 */
export function checkSeedTarget({ nodeEnv, dbUrl }) {
  if (nodeEnv === "production") {
    return "Refusing to run the test seed with NODE_ENV=production."
  }
  if (!dbUrl?.startsWith("file:")) {
    return "Refusing to run the test seed: the database URL must be a local file: URL."
  }
  return null
}
