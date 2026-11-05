import bcrypt from "bcryptjs"
import { describe, expect, it } from "vitest"

import {
  generateTemporaryPassword,
  validateNewPassword,
} from "@/lib/server/passwords"

describe("generateTemporaryPassword", () => {
  it("is at least 12 characters with mixed classes and no ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword()
      expect(password.length).toBeGreaterThanOrEqual(12)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[0-9]/)
      expect(password).not.toMatch(/[0OoIl1|]/)
    }
  })

  it("does not repeat", () => {
    const seen = new Set(
      Array.from({ length: 500 }, () => generateTemporaryPassword())
    )
    expect(seen.size).toBe(500)
  })
})

describe("validateNewPassword", () => {
  const options = { username: "Nashwan" }

  it("accepts a strong password", async () => {
    expect(await validateNewPassword("blue-Harbor-4821", options)).toBeNull()
  })

  it("rejects passwords shorter than 10 characters", async () => {
    expect(await validateNewPassword("Ab3dEf7h9", options)).toBe(
      "كلمة المرور يجب أن تكون 10 أحرف على الأقل"
    )
  })

  it("rejects the username and passwords containing it, case-insensitively", async () => {
    const message = "لا يمكن أن تحتوي كلمة المرور على اسم المستخدم"
    expect(await validateNewPassword("nashwan", { username: "nashwan" })).toBe(
      message
    )
    expect(await validateNewPassword("xxNASHWANxx99", options)).toBe(message)
  })

  it("rejects common passwords, including Arabic-Indic digit forms", async () => {
    const message = "كلمة المرور شائعة جدًا"
    for (const common of [
      "1234567890",
      "password123",
      "Qwertyuiop",
      "١٢٣٤٥٦٧٨٩٠",
    ]) {
      expect(await validateNewPassword(common, options)).toBe(message)
    }
  })

  it("rejects the current password", async () => {
    const currentHash = await bcrypt.hash("blue-Harbor-4821", 4)
    expect(
      await validateNewPassword("blue-Harbor-4821", { ...options, currentHash })
    ).toBe("لا يمكن استخدام كلمة المرور الحالية")
    expect(
      await validateNewPassword("green-Harbor-4821", { ...options, currentHash })
    ).toBeNull()
  })

  it("reports the length rule before the other rules", async () => {
    expect(await validateNewPassword("nashwan", options)).toBe(
      "كلمة المرور يجب أن تكون 10 أحرف على الأقل"
    )
  })
})
