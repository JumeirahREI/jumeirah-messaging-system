import bcrypt from "bcryptjs"
import { randomInt } from "node:crypto"

const BCRYPT_COST = 12
const MIN_LENGTH = 10
const MIN_USERNAME_CONTAINMENT_LENGTH = 3
const TEMPORARY_PASSWORD_LENGTH = 14

const LOWER = "abcdefghijkmnpqrstuvwxyz"
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const DIGITS = "23456789"
const ALPHABET = LOWER + UPPER + DIGITS

const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "123456789",
  "12345678",
  "0123456789",
  "987654321",
  "9876543210",
  "11111111",
  "1111111111",
  "00000000",
  "0000000000",
  "123123123",
  "12341234",
  "1q2w3e4r5t",
  "1q2w3e4r",
  "qwertyuiop",
  "qwerty123",
  "qwerty12345",
  "asdfghjkl",
  "zxcvbnm123",
  "qazwsxedc",
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "iloveyou",
  "welcome1",
  "welcome123",
  "admin123",
  "administrator",
  "letmein123",
  "changeme",
  "jumeirah",
  "jumeirah1",
  "jumeirah123",
  "abcd1234",
  "abc1234567",
])

const MESSAGES = {
  tooShort: `كلمة المرور يجب أن تكون ${MIN_LENGTH} أحرف على الأقل`,
  containsUsername: "لا يمكن أن تحتوي كلمة المرور على اسم المستخدم",
  common: "كلمة المرور شائعة جدًا",
  sameAsCurrent: "لا يمكن استخدام كلمة المرور الحالية",
} as const

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]
}

export function generateTemporaryPassword(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)]
  while (chars.length < TEMPORARY_PASSWORD_LENGTH) chars.push(pick(ALPHABET))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

function normalizeForComparison(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
}

export async function validateNewPassword(
  password: string,
  options: { username: string; currentHash?: string }
): Promise<string | null> {
  if (password.length < MIN_LENGTH) return MESSAGES.tooShort
  const candidate = normalizeForComparison(password)
  const username = normalizeForComparison(options.username.trim())
  if (
    username &&
    (candidate === username ||
      (username.length >= MIN_USERNAME_CONTAINMENT_LENGTH &&
        candidate.includes(username)))
  ) {
    return MESSAGES.containsUsername
  }
  if (COMMON_PASSWORDS.has(candidate)) return MESSAGES.common
  if (options.currentHash && (await bcrypt.compare(password, options.currentHash)))
    return MESSAGES.sameAsCurrent
  return null
}
