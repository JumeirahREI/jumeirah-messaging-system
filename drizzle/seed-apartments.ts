import { and, eq, isNull } from "drizzle-orm"
import ExcelJS from "exceljs"
import { readFile } from "node:fs/promises"
import { db } from "../src/lib/server/db"
import { apartments, projects, towers, users } from "../src/lib/server/schema"

const EXCEL_FILE =
  "‏‏‏‏‏‏‏‏‏‏‏‏‏‏‏‏‏‏فواتير الخدمات لشهر يونيو للفترة بين 21-5-2026م حتى  24-6-2026م - نسخة.xlsx"
const PROJECT_TITLE = "ابرج الحظاء"
const TOWER_LABEL_A = "A"
const TOWER_LABEL_B = "B"
const HEADER_APARTMENT_MARKER = "رقم الشقة"
const COL_APARTMENT = 3

type CellValue = string | number | boolean | null

function readCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value
  if (typeof value === "object") {
    const hyper = value as { text?: unknown; result?: unknown }
    if (typeof hyper.result === "string" || typeof hyper.result === "number")
      return hyper.result
    if (typeof hyper.text === "string") return hyper.text
  }
  return null
}

function colLetterToNumber(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++)
    n = n * 26 + (letters.charCodeAt(i) - "A".charCodeAt(0) + 1)
  return n
}

type MergeRange = { top: number; left: number; bottom: number; right: number }

function parseMergeRange(raw: string): MergeRange | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(raw)
  if (!m) return null
  return {
    top: Number(m[2]),
    left: colLetterToNumber(m[1]),
    bottom: Number(m[4]),
    right: colLetterToNumber(m[3]),
  }
}

function buildMergeResolver(
  ws: ExcelJS.Worksheet
): (row: number, col: number) => CellValue {
  const merges: MergeRange[] = []
  for (const raw of ws.model.merges) {
    const r = parseMergeRange(raw)
    if (r) merges.push(r)
  }
  return (row: number, col: number): CellValue => {
    for (const m of merges) {
      if (row >= m.top && row <= m.bottom && col >= m.left && col <= m.right)
        return readCell(ws.getRow(m.top).getCell(m.left).value)
    }
    return readCell(ws.getRow(row).getCell(col).value)
  }
}

function deriveTowerPrefix(sheetName: string): string {
  const m = /[A-Za-z]+$/.exec(sheetName.trim())
  return m ? m[0] : ""
}

type TowerData = { prefix: string; label: string; units: string[] }

async function extractApartmentsFromExcel(): Promise<TowerData[]> {
  const buf = await readFile(EXCEL_FILE)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)

  const towerLabelByPrefix: Record<string, string> = {
    A: TOWER_LABEL_A,
    B: TOWER_LABEL_B,
  }
  const result: TowerData[] = []

  for (const ws of wb.worksheets) {
    const prefix = deriveTowerPrefix(ws.name)
    if (!prefix) continue
    const label = towerLabelByPrefix[prefix]
    if (!label) continue

    const resolveCell = buildMergeResolver(ws)
    const seen = new Set<string>()
    const units: string[] = []

    for (let r = 1; r <= ws.rowCount; r++) {
      const apt = resolveCell(r, COL_APARTMENT)
      if (apt === null) continue
      if (typeof apt === "string" && apt.trim() === HEADER_APARTMENT_MARKER)
        continue
      const unitStr =
        typeof apt === "number"
          ? String(apt)
          : typeof apt === "string"
            ? apt.trim()
            : ""
      if (unitStr.length === 0) continue
      if (!seen.has(unitStr)) {
        seen.add(unitStr)
        units.push(unitStr)
      }
    }
    result.push({ prefix, label, units })
  }
  return result
}

async function seedApartments() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1)
  if (!admin)
    throw new Error("No admin user found. Run `bun run db:seed` first.")
  const adminId = admin.id

  const [existingProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.title, PROJECT_TITLE), isNull(projects.deletedAt)))
    .limit(1)
  let projectId: number
  if (existingProject) {
    projectId = existingProject.id
    console.log(`Project "${PROJECT_TITLE}" already exists (id=${projectId}).`)
  } else {
    const [created] = await db
      .insert(projects)
      .values({ title: PROJECT_TITLE, createdBy: adminId })
      .returning({ id: projects.id })
    projectId = created.id
    console.log(`Created project "${PROJECT_TITLE}" (id=${projectId}).`)
  }

  const towersData = await extractApartmentsFromExcel()
  let totalInserted = 0

  for (const td of towersData) {
    const [existingTower] = await db
      .select({ id: towers.id })
      .from(towers)
      .where(
        and(
          eq(towers.projectId, projectId),
          eq(towers.label, td.label),
          isNull(towers.deletedAt)
        )
      )
      .limit(1)
    let towerId: number
    if (existingTower) {
      towerId = existingTower.id
      console.log(`Tower "${td.label}" already exists (id=${towerId}).`)
    } else {
      const [created] = await db
        .insert(towers)
        .values({ projectId, label: td.label, createdBy: adminId })
        .returning({ id: towers.id })
      towerId = created.id
      console.log(`Created tower "${td.label}" (id=${towerId}).`)
    }

    const existingApts = await db
      .select({ label: apartments.label })
      .from(apartments)
      .where(and(eq(apartments.towerId, towerId), isNull(apartments.deletedAt)))
    const existingLabels = new Set(existingApts.map((a) => a.label))

    const toInsert = td.units
      .filter((unit) => !existingLabels.has(`${td.prefix}${unit}`))
      .map((unit) => ({
        towerId,
        projectId,
        label: `${td.prefix}${unit}`,
        unitNumber: unit,
        createdBy: adminId,
      }))

    if (toInsert.length > 0) {
      await db.insert(apartments).values(toInsert)
      totalInserted += toInsert.length
      console.log(
        `  Inserted ${toInsert.length} apartments into "${td.label}".`
      )
    } else {
      console.log(
        `  No new apartments for "${td.label}" (all ${td.units.length} already exist).`
      )
    }
  }

  console.log(`\nDone. Inserted ${totalInserted} new apartments.`)
}

seedApartments()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
