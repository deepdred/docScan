// Offline integrity verify — NO AI.
// Re-scans the re-uploaded file locally (pdf.js + triage) and diffs it
// against the saved baseline with pure compareAnalyses().
import { analyzePdf } from './pdfTools'
import { compareAnalyses } from './compare'

export async function verifyFileAgainstSaved(file, saved) {
  let current
  try {
    current = await analyzePdf(file) // local only — never calls AI
  } catch (e) {
    return {
      ok: false,
      verdict: 'UNREADABLE',
      badge: 'ERROR',
      headline: 'Could not read this file',
      summary: `The uploaded file failed to parse (${e?.message || e}). Nothing was compared.`,
      rows: [],
      newSecurity: null,
    }
  }
  return compareAnalyses(saved, current, file.size)
}
