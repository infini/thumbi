export type VoteKind = 'up' | 'down';

export interface VoteEntry {
  id: string;
  kind: VoteKind;
  note: string;
  createdAt: string;
}

export interface VoteSummary {
  upCount: number;
  downCount: number;
  score: number;
  total: number;
}

export const STORAGE_KEY = '@thumbi/vote-entries';

export function createVoteEntry(kind: VoteKind, note: string): VoteEntry {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    note,
    createdAt: new Date().toISOString(),
  };
}

export function isVoteEntry(value: unknown): value is VoteEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VoteEntry>;

  return (
    typeof candidate.id === 'string' &&
    (candidate.kind === 'up' || candidate.kind === 'down') &&
    typeof candidate.note === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

export function sortEntries(entries: VoteEntry[]): VoteEntry[] {
  return [...entries].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export function getTodaySummary(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): VoteSummary {
  const start = startOfDay(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return getSummaryBetween(entries, start, end);
}

export function getWeekSummary(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): VoteSummary {
  const start = getStartOfWeek(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return getSummaryBetween(entries, start, end);
}

export function getMonthSummary(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): VoteSummary {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );
  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    1
  );
  return getSummaryBetween(entries, start, end);
}

export function getStartOfWeek(date: Date): Date {
  const weekStart = startOfDay(date);
  const currentDay = weekStart.getDay();
  const offset = currentDay === 0 ? -6 : 1 - currentDay;
  weekStart.setDate(weekStart.getDate() + offset);
  return weekStart;
}

export function formatWeekRange(referenceDate: Date = new Date()): string {
  const start = getStartOfWeek(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}.${start.getDate()} - ${end.getMonth() + 1}.${end.getDate()}`;
}

export function formatMonthRange(referenceDate: Date = new Date()): string {
  return `${referenceDate.getFullYear()}년 ${referenceDate.getMonth() + 1}월`;
}

export function formatEntryTimestamp(
  createdAt: string,
  referenceDate: Date = new Date()
): string {
  const date = new Date(createdAt);
  const time = `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;

  if (date.toDateString() === referenceDate.toDateString()) {
    return `오늘 ${time}`;
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${time}`;
}

export function formatScore(score: number): string {
  return score > 0 ? `+${score}` : `${score}`;
}

function getSummaryBetween(
  entries: VoteEntry[],
  start: Date,
  end: Date
): VoteSummary {
  let upCount = 0;
  let downCount = 0;

  for (const entry of entries) {
    const createdAt = new Date(entry.createdAt).getTime();

    if (createdAt < start.getTime() || createdAt >= end.getTime()) {
      continue;
    }

    if (entry.kind === 'up') {
      upCount += 1;
      continue;
    }

    downCount += 1;
  }

  return {
    upCount,
    downCount,
    score: upCount - downCount,
    total: upCount + downCount,
  };
}

function startOfDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function padNumber(value: number): string {
  return value.toString().padStart(2, '0');
}
