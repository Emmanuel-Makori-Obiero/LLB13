export function shouldAutoRetrieveConstitution(
  feature: string,
  queryIsConstitutional: boolean,
): boolean {
  return queryIsConstitutional && feature !== "exam_analysis" && feature !== "notes";
}

export interface RetrievalLimits {
  query: number;
  neighbors: number;
  total: number;
}

export function retrievalLimits(
  feature: string,
  defaults: RetrievalLimits,
): RetrievalLimits {
  if (feature !== "legal_process" && feature !== "legal_explain") return defaults;
  return {
    query: Math.min(defaults.query, 6),
    neighbors: Math.min(defaults.neighbors, 6),
    total: Math.min(defaults.total, 12),
  };
}

export function selectDocumentChunkIndexes(
  totalChunks: number,
  maxChunks: number,
  requireComplete = false,
): number[] {
  const total = Number.isFinite(totalChunks) ? Math.max(0, Math.trunc(totalChunks)) : 0;
  const limit = Number.isFinite(maxChunks) ? Math.max(0, Math.trunc(maxChunks)) : 0;
  if (requireComplete && total > limit) {
    const message = `This paper has ${total} indexed sections; a complete review supports up to ${limit}. Split the paper and retry. No sections were silently omitted.`;
    const error = Object.assign(new Error(message), { status: 413, publicMessage: message });
    throw error;
  }
  if (!total || !limit) return [];
  if (total <= limit) return Array.from({ length: total }, (_, index) => index);
  if (limit === 1) return [total - 1];
  return Array.from({ length: limit }, (_, index) =>
    Math.round(index * (total - 1) / (limit - 1))
  );
}
