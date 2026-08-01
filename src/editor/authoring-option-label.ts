const HAN_CHARACTER = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

function stripKnownIdSuffix(label: string, id: string): string {
  for (const suffix of [` (${id})`, `（${id}）`]) {
    if (label.endsWith(suffix)) return label.slice(0, -suffix.length).trim()
  }
  return label
}

/** 作者态选择项：有中文名称时隐藏技术 id；没有中文名称时保留 id 兜底。 */
export function authoringOptionLabel(name: string | undefined, id: string): string {
  const fallback = id.trim()
  const readable = stripKnownIdSuffix(name?.trim() ?? '', fallback)
  if (!readable || readable === fallback) return fallback
  if (HAN_CHARACTER.test(readable) || !fallback) return readable
  return `${readable} (${fallback})`
}
