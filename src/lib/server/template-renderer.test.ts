import { describe, expect, it } from "vitest"

import {
  NOTIFICATION_TEMPLATE_RAW,
  WARNING_TEMPLATE_RAW,
  renderNotification,
  renderWarning,
} from "./template-renderer"

describe("template-renderer", () => {
  describe("renderNotification", () => {
    it("substitutes amount and unit_label into the notification template", () => {
      const out = renderNotification({ amount: 56840.8, unit_label: "A101" })
      expect(out).toContain("A101")
      expect(out).toContain("جميرا الخدمات")
      expect(out).toContain("يرجى سرعة السداد")
      expect(out).toContain("شاكرين حسن تعاونكم")
      expect(out).not.toContain("{amount}")
      expect(out).not.toContain("{unit_label}")
    })

    it("formats the amount with two decimal places in Arabic locale", () => {
      const out = renderNotification({ amount: 1000, unit_label: "B202" })
      expect(out).toMatch(/١٬٠٠٠[٫.]٠٠|1,000\.00/)
    })

    it("preserves the template structure when vars are substituted", () => {
      const out = renderNotification({ amount: 0, unit_label: "X001" })
      const lines = out.split("\n")
      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe("جميرا الخدمات")
    })

    it("matches the raw notification template from the PRD", () => {
      expect(NOTIFICATION_TEMPLATE_RAW).toBe(
        `جميرا الخدمات\nعليكم {amount} للشقة {unit_label} يرجى سرعة السداد\nشاكرين حسن تعاونكم`
      )
    })
  })

  describe("renderWarning", () => {
    it("substitutes amount and unit_label into the warning template", () => {
      const out = renderWarning({ amount: 31965.3, unit_label: "A102" })
      expect(out).toContain("A102")
      expect(out).toContain("جميرا الخدمات")
      expect(out).toContain("لتجنب الفصل")
      expect(out).not.toContain("{amount}")
      expect(out).not.toContain("{unit_label}")
    })

    it("includes the 'today' urgency phrase not present in notification", () => {
      const warning = renderWarning({ amount: 100, unit_label: "A101" })
      const notification = renderNotification({
        amount: 100,
        unit_label: "A101",
      })
      expect(warning).toContain("اليوم")
      expect(notification).not.toContain("اليوم")
    })

    it("matches the raw warning template from the PRD", () => {
      expect(WARNING_TEMPLATE_RAW).toBe(
        `جميرا الخدمات\nعليكم {amount} للشقة {unit_label} يرجى سرعة السداد اليوم لتجنب الفصل`
      )
    })
  })
})
