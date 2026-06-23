import type {
  AiWeeklyReviewCompactSections,
  AiWeeklyReviewSectionBlock,
  AdminWeeklySummaryDto,
  WeeklySummaryAiResult,
  WeeklySummaryData,
} from './types';

export type WeeklyReviewMapperInput =
  | AdminWeeklySummaryDto
  | WeeklySummaryData
  | {
      sections?: AiWeeklyReviewCompactSections | null;
      aiReport?: { sections?: AiWeeklyReviewCompactSections | null } | null;
      ai_report?: { sections?: AiWeeklyReviewCompactSections | null } | null;
      aiSummary?: WeeklySummaryAiResult | null;
      ai_summary?: WeeklySummaryAiResult | null;
      completedSummary?: string | null;
      pendingSummary?: string | null;
      problemSummary?: string | null;
      suggestionSummary?: string | null;
      nextWeekPlan?: string | null;
    };

function trimReviewText(text: unknown): string {
  return String(text ?? '').trim();
}

function splitToLines(value?: string | string[] | null): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => trimReviewText(item)).filter(Boolean);
  }
  const text = trimReviewText(value);
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter(Boolean);
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

function buildBlockFromSources(
  sources: Array<string | string[] | null | undefined>,
): AiWeeklyReviewSectionBlock {
  const summaryParts: string[] = [];
  const itemLines: string[] = [];

  for (const source of sources) {
    if (source == null) continue;
    if (Array.isArray(source)) {
      itemLines.push(...splitToLines(source));
      continue;
    }
    const lines = splitToLines(source);
    if (lines.length === 0) continue;
    if (lines.length === 1) {
      summaryParts.push(lines[0]);
    } else {
      summaryParts.push(lines[0]);
      itemLines.push(...lines.slice(1));
    }
  }

  const summary = dedupeLines(summaryParts).join('\n\n');
  const items = dedupeLines(itemLines).filter((item) => !summaryParts.some((part) => part === item));

  return { summary, items };
}

function normalizeSectionBlock(
  block?: AiWeeklyReviewSectionBlock | null,
): AiWeeklyReviewSectionBlock | null {
  if (!block || typeof block !== 'object') return null;

  const rawSummary = trimReviewText(block.summary);
  const rawItems = dedupeLines(
    (Array.isArray(block.items) ? block.items : [])
      .map((item) => trimReviewText(item))
      .filter(Boolean),
  );

  if (!rawSummary && rawItems.length === 0) return null;

  const items = rawItems.filter((item) => item !== rawSummary);
  return { summary: rawSummary, items };
}

function normalizeCompactSections(
  raw?: Partial<AiWeeklyReviewCompactSections> | null,
): AiWeeklyReviewCompactSections | null {
  if (!raw || typeof raw !== 'object') return null;

  const completed = normalizeSectionBlock(raw.completed);
  const unfinished = normalizeSectionBlock(raw.unfinished);
  const nextFocus = normalizeSectionBlock(raw.nextFocus ?? (raw as { next_focus?: AiWeeklyReviewSectionBlock }).next_focus);

  if (!completed && !unfinished && !nextFocus) return null;

  return {
    completed: completed ?? { summary: '', items: [] },
    unfinished: unfinished ?? { summary: '', items: [] },
    nextFocus: nextFocus ?? { summary: '', items: [] },
  };
}

export function hasCompactWeeklyReviewContent(sections?: AiWeeklyReviewCompactSections | null): boolean {
  if (!sections) return false;
  return [sections.completed, sections.unfinished, sections.nextFocus].some(
    (block) => Boolean(String(block.summary ?? '').trim()) || (Array.isArray(block.items) && block.items.length > 0),
  );
}

function extractAiSummaryBlockSections(aiSummary?: WeeklySummaryAiResult | null): AiWeeklyReviewCompactSections | null {
  if (!aiSummary || typeof aiSummary !== 'object') return null;
  const record = aiSummary as Record<string, unknown>;
  const hasBlockShape = Boolean(record.completed || record.unfinished || record.nextFocus || record.next_focus);
  if (!hasBlockShape) return null;
  return normalizeCompactSections({
    completed: record.completed as AiWeeklyReviewSectionBlock | undefined,
    unfinished: record.unfinished as AiWeeklyReviewSectionBlock | undefined,
    nextFocus: (record.nextFocus ?? record.next_focus) as AiWeeklyReviewSectionBlock | undefined,
  });
}

function extractNewStructureSections(input: WeeklyReviewMapperInput): AiWeeklyReviewCompactSections | null {
  const record = input as Record<string, unknown>;
  const aiReport = (record.aiReport ?? record.ai_report) as { sections?: AiWeeklyReviewCompactSections } | null | undefined;
  const aiSummary = (record.aiSummary ?? record.ai_summary) as WeeklySummaryAiResult | null | undefined;

  const rawSections =
    record.sections
    ?? aiReport?.sections
    ?? aiSummary?.sections;

  const fromSections = normalizeCompactSections(rawSections as Partial<AiWeeklyReviewCompactSections> | null | undefined);
  if (fromSections && hasCompactWeeklyReviewContent(fromSections)) {
    return fromSections;
  }

  return extractAiSummaryBlockSections(aiSummary);
}

function mapLegacyAdminFields(input: WeeklyReviewMapperInput): AiWeeklyReviewCompactSections {
  const record = input as Record<string, unknown>;
  return {
    completed: buildBlockFromSources([record.completedSummary as string | null | undefined]),
    unfinished: buildBlockFromSources([
      record.pendingSummary as string | null | undefined,
      record.problemSummary as string | null | undefined,
    ]),
    nextFocus: buildBlockFromSources([
      record.nextWeekPlan as string | null | undefined,
      record.suggestionSummary as string | null | undefined,
    ]),
  };
}

function mapLegacyEmployeeAiSummary(aiSummary?: WeeklySummaryAiResult | null): AiWeeklyReviewCompactSections {
  return {
    completed: buildBlockFromSources([aiSummary?.highlights]),
    unfinished: buildBlockFromSources([aiSummary?.risks]),
    nextFocus: buildBlockFromSources([aiSummary?.nextWeekSuggestions]),
  };
}

export function resolveCompactWeeklyReviewSections(
  input?: WeeklyReviewMapperInput | null,
): AiWeeklyReviewCompactSections | null {
  if (!input || typeof input !== 'object') return null;

  const fromNewStructure = extractNewStructureSections(input);
  if (fromNewStructure && hasCompactWeeklyReviewContent(fromNewStructure)) {
    return fromNewStructure;
  }

  const record = input as Record<string, unknown>;
  const hasAdminLegacy = Boolean(
    record.completedSummary
    || record.pendingSummary
    || record.problemSummary
    || record.nextWeekPlan
    || record.suggestionSummary,
  );

  const legacySections = hasAdminLegacy
    ? mapLegacyAdminFields(input)
    : mapLegacyEmployeeAiSummary(
      (record.aiSummary ?? record.ai_summary) as WeeklySummaryAiResult | null | undefined,
    );

  if (!hasCompactWeeklyReviewContent(legacySections)) return null;
  return legacySections;
}
