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

function substitute(template: string, vars: TemplateVars): string {
  return template
    .replace("{amount}", formatAmount(vars.amount))
    .replace("{unit_label}", vars.unit_label)
}

export function renderNotification(vars: TemplateVars): string {
  return substitute(NOTIFICATION_TEMPLATE, vars)
}

export function renderWarning(vars: TemplateVars): string {
  return substitute(WARNING_TEMPLATE, vars)
}

export const NOTIFICATION_TEMPLATE_RAW = NOTIFICATION_TEMPLATE
export const WARNING_TEMPLATE_RAW = WARNING_TEMPLATE
