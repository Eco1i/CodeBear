import type { AppLanguage } from "../preferences/types";
import type { DictionarySummary } from "./types";

export function importSuccessMessage(
  result: DictionarySummary,
  language: AppLanguage = "zh-CN",
): string {
  const skippedSame = result.skipped_duplicate_count ?? 0;
  const skippedConflict = result.skipped_conflict_count ?? 0;
  if (language === "en-US") {
    if (skippedSame === 0 && skippedConflict === 0) {
      return `${result.item_count} dictionary values imported`;
    }
    const parts: string[] = [];
    if (skippedSame > 0) parts.push(`${skippedSame} exact duplicates`);
    if (skippedConflict > 0) {
      const examples = result.conflicting_codes?.length
        ? `: e.g. ${result.conflicting_codes.join(", ")}`
        : "";
      parts.push(`${skippedConflict} same-code/different-name rows${examples}`);
    }
    return `${result.item_count} dictionary values imported; ${skippedSame + skippedConflict} duplicate rows skipped automatically (${parts.join("; ")}); first occurrence retained for duplicate codes`;
  }
  if (skippedSame === 0 && skippedConflict === 0) {
    return `已导入 ${result.item_count} 条字典值`;
  }
  const parts: string[] = [];
  if (skippedSame > 0) {
    parts.push(`完全相同 ${skippedSame} 条`);
  }
  if (skippedConflict > 0) {
    const examples = result.conflicting_codes?.length
      ? `：如 ${result.conflicting_codes.join("、")}`
      : "";
    parts.push(`同码不同名 ${skippedConflict} 条${examples}`);
  }
  return `已导入 ${result.item_count} 条字典值，已自动跳过 ${skippedSame + skippedConflict} 条重复行（${parts.join("、")}），同码保留首次出现`;
}
