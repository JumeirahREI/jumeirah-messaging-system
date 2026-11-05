export function generateTemporaryPassword(): string {
  return "x"
}

export async function validateNewPassword(
  _password: string,
  _options: { username: string; currentHash?: string }
): Promise<string | null> {
  return null
}
