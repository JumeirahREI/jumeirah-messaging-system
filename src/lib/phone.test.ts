import { describe, expect, it } from "vitest"

import {
  extractLocalNumber,
  isValidYemeniPhone,
  toDisplayFormat,
  toStorageFormat,
} from "@/lib/phone"

describe("extractLocalNumber", () => {
  it("returns raw 9-digit number as-is", () => {
    expect(extractLocalNumber("771811986")).toBe("771811986")
  })

  it("strips leading 967", () => {
    expect(extractLocalNumber("967771811986")).toBe("771811986")
  })

  it("strips leading 00967", () => {
    expect(extractLocalNumber("00967771811986")).toBe("771811986")
  })

  it("strips non-digit characters", () => {
    expect(extractLocalNumber("+967 771-811 986")).toBe("771811986")
  })

  it("handles +967 prefix with spaces", () => {
    expect(extractLocalNumber("+967 771811986")).toBe("771811986")
  })

  it("returns empty string for empty input", () => {
    expect(extractLocalNumber("")).toBe("")
  })
})

describe("isValidYemeniPhone", () => {
  it.each(["771811986", "701234567", "711234567", "731234567", "771234567", "781234567"])(
    "accepts valid number %s",
    (n) => {
      expect(isValidYemeniPhone(n)).toBe(true)
    }
  )

  it.each([
    "791234567",
    "801234567",
    "721234567",
    "7",
    "77181198",
    "7718119866",
    "",
    "123456789",
  ])("rejects invalid number %s", (n) => {
    expect(isValidYemeniPhone(n)).toBe(false)
  })
})

describe("toStorageFormat", () => {
  it("prepends 967 to local number", () => {
    expect(toStorageFormat("771811986")).toBe("967771811986")
  })
})

describe("toDisplayFormat", () => {
  it("strips leading 967", () => {
    expect(toDisplayFormat("967771811986")).toBe("771811986")
  })

  it("returns as-is when no 967 prefix", () => {
    expect(toDisplayFormat("771811986")).toBe("771811986")
  })
})
