const NOTIFICATION_TEMPLATE = `جميرا الخدمات
عليكم {amount} للشقة {unit_label} يرجى سرعة السداد
شاكرين حسن تعاونكم`

const WARNING_TEMPLATE = `جميرا الخدمات
عليكم {amount} للشقة {unit_label} يرجى سرعة السداد اليوم لتجنب الفصل`

type TemplateVars = {
  amount: number
  unit_label: string
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function sanitizeLabel(label: string): string {
  const stripped = label
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, 100)
  return stripped
}

function substitute(template: string, vars: TemplateVars): string {
  return template
    .replace("{amount}", formatAmount(vars.amount))
    .replace("{unit_label}", sanitizeLabel(vars.unit_label))
}

export function renderNotification(vars: TemplateVars): string {
  return substitute(NOTIFICATION_TEMPLATE, vars)
}

export function renderWarning(vars: TemplateVars): string {
  return substitute(WARNING_TEMPLATE, vars)
}

export const NOTIFICATION_TEMPLATE_RAW = NOTIFICATION_TEMPLATE
export const WARNING_TEMPLATE_RAW = WARNING_TEMPLATE
