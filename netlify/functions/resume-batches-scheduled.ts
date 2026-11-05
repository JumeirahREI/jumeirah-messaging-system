import type { Config } from "@netlify/functions"

import { resumeStalledBatches } from "../../src/lib/server/batch/resume"

export const config: Config = {
  schedule: "*/2 * * * *",
}

export default async (_req: Request): Promise<void> => {
  await resumeStalledBatches()
}
