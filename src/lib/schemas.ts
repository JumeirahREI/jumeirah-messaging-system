import { z } from "zod"

export const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
})

export const projectSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
})

export const towerSchema = z.object({
  label: z.string().min(1, "الاسم مطلوب"),
})

export const apartmentSchema = z.object({
  label: z.string().min(1, "الاسم مطلوب"),
  unitNumber: z.string().optional(),
})

export const contactSchema = z.object({
  fullname: z.string().min(1, "الاسم مطلوب"),
})

export const contactLinkSchema = z.object({
  apartmentId: z.number(),
  contactId: z.number().optional(),
  newName: z.string().optional(),
  role: z.enum(["owner", "tenant", "manager"]),
  isNotificationRecipient: z.boolean(),
})

export const phoneNumberSchema = z.object({
  contactId: z.number(),
  number: z.string().min(1, "الرقم مطلوب"),
})

export const userCreateSchema = z.object({
  fullname: z.string().min(1, "الاسم الكامل مطلوب"),
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  isAdmin: z.boolean(),
})

export const userUpdateSchema = z.object({
  id: z.number(),
  fullname: z.string().min(1, "الاسم الكامل مطلوب"),
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  isAdmin: z.boolean(),
})

export const passwordResetSchema = z.object({
  id: z.number(),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
})

export const batchCreateSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  projectId: z.string().min(1, "المشروع مطلوب"),
})

export const batchFilterSchema = z.object({
  page: z.number().int().positive().default(1),
  status: z.enum(["all", "draft", "sending", "completed"]).default("all"),
  archived: z.boolean().default(false),
})

export const warningSendSchema = z.object({
  batchId: z.number(),
  invoiceIds: z.array(z.number()).min(1, "اختر فاتورة واحدة على الأقل"),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type ProjectFormData = z.infer<typeof projectSchema>
export type TowerFormData = z.infer<typeof towerSchema>
export type ApartmentFormData = z.infer<typeof apartmentSchema>
export type ContactFormData = z.infer<typeof contactSchema>
export type ContactLinkFormData = z.infer<typeof contactLinkSchema>
export type PhoneNumberFormData = z.infer<typeof phoneNumberSchema>
export type UserCreateFormData = z.infer<typeof userCreateSchema>
export type UserUpdateFormData = z.infer<typeof userUpdateSchema>
export type PasswordResetFormData = z.infer<typeof passwordResetSchema>
export type BatchCreateFormData = z.infer<typeof batchCreateSchema>
export type BatchFilterFormData = z.infer<typeof batchFilterSchema>
export type WarningSendFormData = z.infer<typeof warningSendSchema>
