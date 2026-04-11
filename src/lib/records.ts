export type VoteKind = 'up' | 'down';

export interface VoteEntry {
  id: string;
  kind: VoteKind;
  note: string;
  createdAt: string;
  batchId?: string;
}

export interface VoteSummary {
  upCount: number;
  downCount: number;
  score: number;
  total: number;
}

export type PeriodUnit = 'month' | 'quarter' | 'year';

export interface BestPeriodRecord {
  label: string;
  count: number;
  summary: VoteSummary;
}

export interface PeriodBestRecords {
  upRecord: BestPeriodRecord | null;
  downRecord: BestPeriodRecord | null;
}

export interface CalendarDay {
  date: Date;
  dayNumber: number;
  isToday: boolean;
  summary: VoteSummary;
}

export const STORAGE_KEY = '@thumbi/vote-entries';

export function createVoteEntry(
  kind: VoteKind,
  note: string,
  options?: {
    batchId?: string;
    createdAt?: string;
  }
): VoteEntry {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    note,
    createdAt: options?.createdAt ?? new Date().toISOString(),
    ...(options?.batchId ? { batchId: options.batchId } : {}),
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
    typeof candidate.createdAt === 'string' &&
    (candidate.batchId === undefined || typeof candidate.batchId === 'string')
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

export function getDaySummary(
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

export function getQuarterSummary(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): VoteSummary {
  const start = getQuarterStart(referenceDate);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  return getSummaryBetween(entries, start, end);
}

export function getYearSummary(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): VoteSummary {
  const start = new Date(referenceDate.getFullYear(), 0, 1);
  const end = new Date(referenceDate.getFullYear() + 1, 0, 1);
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

export function formatQuarterRange(referenceDate: Date = new Date()): string {
  const quarter = Math.floor(referenceDate.getMonth() / 3) + 1;
  return `${referenceDate.getFullYear()}년 ${quarter}분기`;
}

export function formatYearRange(referenceDate: Date = new Date()): string {
  return `${referenceDate.getFullYear()}년`;
}

export function getBestPeriodRecords(
  entries: VoteEntry[],
  unit: PeriodUnit
): PeriodBestRecords {
  const periodMap = new Map<string, PeriodBucket>();

  for (const entry of entries) {
    const entryDate = new Date(entry.createdAt);

    if (Number.isNaN(entryDate.getTime())) {
      continue;
    }

    const start = getPeriodStart(entryDate, unit);
    const key = getPeriodKey(start, unit);
    const existing = periodMap.get(key);
    const bucket =
      existing ??
      {
        key,
        label: getPeriodLabel(start, unit),
        start,
        upCount: 0,
        downCount: 0,
        score: 0,
        total: 0,
      };

    if (entry.kind === 'up') {
      bucket.upCount += 1;
    } else {
      bucket.downCount += 1;
    }

    bucket.score = bucket.upCount - bucket.downCount;
    bucket.total = bucket.upCount + bucket.downCount;

    periodMap.set(key, bucket);
  }

  let bestUp: PeriodBucket | null = null;
  let bestDown: PeriodBucket | null = null;

  for (const bucket of periodMap.values()) {
    if (bucket.upCount > 0 && isBetterBucket(bucket, bestUp, 'up')) {
      bestUp = bucket;
    }

    if (bucket.downCount > 0 && isBetterBucket(bucket, bestDown, 'down')) {
      bestDown = bucket;
    }
  }

  return {
    upRecord: bestUp ? toBestPeriodRecord(bestUp, 'up') : null,
    downRecord: bestDown ? toBestPeriodRecord(bestDown, 'down') : null,
  };
}

export function getEntriesForDay(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): VoteEntry[] {
  const start = startOfDay(referenceDate).getTime();
  const end = new Date(startOfDay(referenceDate));
  end.setDate(end.getDate() + 1);
  const endTime = end.getTime();

  return entries.filter((entry) => {
    const createdAt = new Date(entry.createdAt).getTime();
    return createdAt >= start && createdAt < endTime;
  });
}

export function getMonthCalendar(
  entries: VoteEntry[],
  referenceDate: Date = new Date()
): Array<CalendarDay | null> {
  const monthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );
  const monthEnd = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0
  );
  const leadingEmptyCount = (monthStart.getDay() + 6) % 7;
  const cells: Array<CalendarDay | null> = [];

  for (let index = 0; index < leadingEmptyCount; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const cellDate = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      day
    );

    cells.push({
      date: cellDate,
      dayNumber: day,
      isToday: cellDate.toDateString() === new Date().toDateString(),
      summary: getDaySummary(entries, cellDate),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function formatDateLabel(referenceDate: Date = new Date()): string {
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${referenceDate.getFullYear()}년 ${referenceDate.getMonth() + 1}월 ${referenceDate.getDate()}일 ${weekDays[referenceDate.getDay()]}요일`;
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

function getQuarterStart(date: Date): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
}

function getPeriodStart(date: Date, unit: PeriodUnit): Date {
  if (unit === 'month') {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  if (unit === 'quarter') {
    return getQuarterStart(date);
  }

  return new Date(date.getFullYear(), 0, 1);
}

function getPeriodKey(date: Date, unit: PeriodUnit): string {
  if (unit === 'month') {
    return `${date.getFullYear()}-${date.getMonth() + 1}`;
  }

  if (unit === 'quarter') {
    return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  }

  return `${date.getFullYear()}`;
}

function getPeriodLabel(date: Date, unit: PeriodUnit): string {
  if (unit === 'month') {
    return formatMonthRange(date);
  }

  if (unit === 'quarter') {
    return formatQuarterRange(date);
  }

  return formatYearRange(date);
}

function isBetterBucket(
  candidate: PeriodBucket,
  current: PeriodBucket | null,
  kind: VoteKind
): boolean {
  if (!current) {
    return true;
  }

  const candidateCount = kind === 'up' ? candidate.upCount : candidate.downCount;
  const currentCount = kind === 'up' ? current.upCount : current.downCount;

  if (candidateCount !== currentCount) {
    return candidateCount > currentCount;
  }

  return candidate.start.getTime() > current.start.getTime();
}

function toBestPeriodRecord(
  bucket: PeriodBucket,
  kind: VoteKind
): BestPeriodRecord {
  return {
    label: bucket.label,
    count: kind === 'up' ? bucket.upCount : bucket.downCount,
    summary: {
      upCount: bucket.upCount,
      downCount: bucket.downCount,
      score: bucket.score,
      total: bucket.total,
    },
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

interface PeriodBucket extends VoteSummary {
  key: string;
  label: string;
  start: Date;
}
