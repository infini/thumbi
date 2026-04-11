import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type CalendarDay,
  type BestPeriodRecord,
  createVoteEntry,
  formatDateLabel,
  formatEntryTimestamp,
  formatMonthRange,
  formatQuarterRange,
  formatScore,
  formatWeekRange,
  getDaySummary,
  getEntriesForDay,
  getBestPeriodRecords,
  getMonthCalendar,
  getMonthSummary,
  getQuarterSummary,
  getTodaySummary,
  getWeekSummary,
  isVoteEntry,
  sortEntries,
  STORAGE_KEY,
  type VoteEntry,
  type VoteKind,
  type VoteSummary,
} from './src/lib/records';
import { fonts, palette } from './src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
const UNDO_TIMEOUT_MS = 5000;
const REPEAT_STEP = 5;
const REPEAT_INTERVAL_MS = 1000;
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const TAB_BAR_HEIGHT = 76;

interface PendingUndoAction {
  entries: VoteEntry[];
  kind: VoteKind;
  note: string;
}

type TabKey = 'home' | 'calendar' | 'stats';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<VoteEntry[]>([]);
  const [draftNote, setDraftNote] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingUndoAction, setPendingUndoAction] =
    useState<PendingUndoAction | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipNextPressRef = useRef(false);
  const holdBatchEntriesRef = useRef<VoteEntry[]>([]);
  const holdNoteRef = useRef('');

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);

        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
          return;
        }

        const normalized = sortEntries(parsed.filter(isVoteEntry));

        if (isMounted) {
          setEntries(normalized);
        }
      } catch (error) {
        console.error('Failed to load vote entries.', error);
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    }

    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch((error) => {
      console.error('Failed to persist vote entries.', error);
    });
  }, [entries, isHydrated]);

  useEffect(() => {
    if (!pendingUndoAction) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPendingUndoAction(null);
    }, UNDO_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingUndoAction]);

  useEffect(() => {
    return () => {
      stopRepeatInput();
    };
  }, []);

  const now = new Date();
  const todaySummary = getTodaySummary(entries, now);
  const weekSummary = getWeekSummary(entries, now);
  const monthSummary = getMonthSummary(entries, now);
  const quarterSummary = getQuarterSummary(entries, now);
  const monthBestRecords = getBestPeriodRecords(entries, 'month');
  const quarterBestRecords = getBestPeriodRecords(entries, 'quarter');
  const yearBestRecords = getBestPeriodRecords(entries, 'year');
  const calendarDays = getMonthCalendar(entries, now);
  const recentEntries = entries.slice(0, 6);
  const todayScoreColor = getTrendColor(todaySummary.score);
  const selectedDaySummary = selectedDate ? getDaySummary(entries, selectedDate) : null;
  const selectedDayEntries = selectedDate ? getEntriesForDay(entries, selectedDate) : [];
  const selectedDayTrendColor = selectedDaySummary
    ? getTrendColor(selectedDaySummary.score)
    : palette.text;
  const scrollBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 72;

  function handleAddEntry(kind: VoteKind) {
    if (skipNextPressRef.current) {
      skipNextPressRef.current = false;
      return;
    }

    const note = draftNote.trim();
    const nextEntry = createVoteEntry(kind, note);
    setEntries((currentEntries) => sortEntries([nextEntry, ...currentEntries]));
    setPendingUndoAction({
      entries: [nextEntry],
      kind,
      note,
    });
    setDraftNote('');
  }

  function handleUndoAdd() {
    if (!pendingUndoAction) {
      return;
    }

    const pendingIds = new Set(pendingUndoAction.entries.map((entry) => entry.id));
    setEntries((currentEntries) =>
      currentEntries.filter((entry) => !pendingIds.has(entry.id))
    );
    setPendingUndoAction(null);
  }

  function addBatchEntries(kind: VoteKind, count: number, note: string) {
    const createdEntries = Array.from({ length: count }, () =>
      createVoteEntry(kind, note)
    );

    setEntries((currentEntries) => sortEntries([...createdEntries, ...currentEntries]));
    holdBatchEntriesRef.current = [...holdBatchEntriesRef.current, ...createdEntries];
    setPendingUndoAction({
      entries: holdBatchEntriesRef.current,
      kind,
      note,
    });
  }

  function handleRepeatStart(kind: VoteKind) {
    stopRepeatInput();
    skipNextPressRef.current = true;
    holdBatchEntriesRef.current = [];
    holdNoteRef.current = draftNote.trim();
    addBatchEntries(kind, REPEAT_STEP, holdNoteRef.current);
    setDraftNote('');
    repeatIntervalRef.current = setInterval(() => {
      addBatchEntries(kind, REPEAT_STEP, holdNoteRef.current);
    }, REPEAT_INTERVAL_MS);
  }

  function stopRepeatInput() {
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }

    holdBatchEntriesRef.current = [];
    holdNoteRef.current = '';
  }

  function handleResetSelectedDay() {
    if (!selectedDate || selectedDayEntries.length === 0) {
      return;
    }

    const targetDate = selectedDate;
    const targetIds = new Set(selectedDayEntries.map((entry) => entry.id));

    Alert.alert(
      '일별 기록 초기화',
      `${formatDateLabel(targetDate)} 기록 ${selectedDayEntries.length}건을 모두 지울까요?`,
      [
        {
          style: 'cancel',
          text: '취소',
        },
        {
          style: 'destructive',
          text: '초기화',
          onPress: () => {
            setEntries((currentEntries) =>
              currentEntries.filter((entry) => !targetIds.has(entry.id))
            );
            setPendingUndoAction(null);
            setSelectedDate(null);
          },
        },
      ]
    );
  }

  function handleDeleteEntry(entry: VoteEntry) {
    Alert.alert(
      '기록 삭제',
      entry.note ? `"${entry.note}" 기록을 지울까요?` : '이 기록을 지울까요?',
      [
        {
          style: 'cancel',
          text: '취소',
        },
        {
          style: 'destructive',
          text: '삭제',
          onPress: () => {
            setEntries((currentEntries) =>
              currentEntries.filter((currentEntry) => currentEntry.id !== entry.id)
            );
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        <View style={[styles.orb, styles.orbRise]} />
        <View style={[styles.orb, styles.orbFall]} />
        <View style={[styles.orb, styles.orbSun]} />
      </View>
      <View style={styles.topBarShell}>
        <View style={styles.topBar}>
          <View style={styles.brandBadge}>
            <View style={styles.brandIcon}>
              <MaterialCommunityIcons
                color={palette.rise}
                name="chart-line-variant"
                size={18}
              />
            </View>
            <Text style={styles.brandText}>Thumbi</Text>
            <Pressable
              hitSlop={8}
              onPress={() => setIsInfoOpen(true)}
              style={({ pressed }) => [
                styles.brandInfoButton,
                pressed && styles.brandInfoPressed,
              ]}
            >
              <MaterialCommunityIcons
                color={palette.textMuted}
                name="information-outline"
                size={16}
              />
            </Pressable>
          </View>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'home' ? (
          <>
            <LinearGradient
              colors={['#FFF1F4', '#FFFFFF', '#EEF4FF']}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.heroCard}
            >
              <View style={styles.heroHeader}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>오늘 기록</Text>
                </View>
                <View
                  style={[
                    styles.scoreBubble,
                    {
                      backgroundColor: getTrendSoft(todaySummary.score),
                      borderColor: `${todayScoreColor}28`,
                    },
                  ]}
                >
                  <Text style={styles.scoreLabel}>오늘 점수</Text>
                  <Text style={[styles.scoreValue, { color: todayScoreColor }]}>
                    {formatScore(todaySummary.score)}
                  </Text>
                </View>
              </View>

              <View style={styles.metricRow}>
                <MetricPill
                  accentColor={palette.rise}
                  backgroundColor={palette.riseSoft}
                  icon="arrow-top-right-thick"
                  label="상승 기록"
                  value={todaySummary.upCount}
                />
                <MetricPill
                  accentColor={palette.fall}
                  backgroundColor={palette.fallSoft}
                  icon="arrow-bottom-left-thick"
                  label="하락 기록"
                  value={todaySummary.downCount}
                />
              </View>

              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>메모를 남길까요?</Text>
                <TextInput
                  multiline
                  onChangeText={setDraftNote}
                  placeholder="예: 스스로 장난감 정리함 / 숙제 미루기"
                  placeholderTextColor={palette.textSoft}
                  style={styles.noteInput}
                  textAlignVertical="top"
                  value={draftNote}
                />
              </View>

              <View style={styles.actionRow}>
                <ActionButton
                  colors={['#FFD8DE', '#FF8B98']}
                  icon="arrow-top-right-thick"
                  kind="up"
                  label="엄지 업"
                  onLongPress={handleRepeatStart}
                  onPressOut={stopRepeatInput}
                  onPress={() => handleAddEntry('up')}
                  subtitle="빨간 상승으로 기록"
                  iconColor={palette.rise}
                  labelColor="#8F223B"
                  subtitleColor="#B54E64"
                />
                <ActionButton
                  colors={['#DDEBFF', '#8EBEFF']}
                  icon="arrow-bottom-left-thick"
                  kind="down"
                  label="엄지 다운"
                  onLongPress={handleRepeatStart}
                  onPressOut={stopRepeatInput}
                  onPress={() => handleAddEntry('down')}
                  subtitle="파란 하락으로 기록"
                  iconColor={palette.fall}
                  labelColor="#1F4F89"
                  subtitleColor="#517AB2"
                />
              </View>
            </LinearGradient>

            <View style={styles.recentCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>최근 기록</Text>
                  <Text style={styles.sectionDescription}>
                    가장 최근에 남긴 {recentEntries.length}개의 기록입니다.
                  </Text>
                </View>
                <View style={styles.sectionChip}>
                  <MaterialCommunityIcons
                    color={palette.textMuted}
                    name="history"
                    size={16}
                  />
                  <Text style={styles.sectionChipText}>{entries.length}개 저장</Text>
                </View>
              </View>

              {!isHydrated ? (
                <Text style={styles.emptyText}>기록을 불러오는 중이에요.</Text>
              ) : recentEntries.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyStateIcon}>
                    <MaterialCommunityIcons
                      color={palette.rise}
                      name="chart-line-variant"
                      size={24}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>첫 기록을 남겨보세요</Text>
                  <Text style={styles.emptyText}>
                    엄지 업이나 엄지 다운을 눌러 첫 번째 변화를 저장할 수 있어요.
                  </Text>
                </View>
              ) : (
                <View style={styles.entriesList}>
                  {recentEntries.map((entry) => (
                    <EntryRow entry={entry} key={entry.id} onDelete={handleDeleteEntry} />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}

        {activeTab === 'calendar' ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>월간 달력</Text>
                <Text style={styles.sectionDescription}>
                  날짜를 눌러 그날 기록을 보고 필요하면 초기화할 수 있어요.
                </Text>
              </View>
              <View style={styles.sectionChip}>
                <MaterialCommunityIcons
                  color={palette.textMuted}
                  name="calendar-month"
                  size={16}
                />
                <Text style={styles.sectionChipText}>{formatMonthRange(now)}</Text>
              </View>
            </View>

            <View style={styles.calendarCard}>
              <View style={styles.calendarWeekdays}>
                {WEEKDAY_LABELS.map((weekday) => (
                  <Text key={weekday} style={styles.calendarWeekday}>
                    {weekday}
                  </Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) =>
                  day ? (
                    <CalendarDayCell
                      day={day}
                      key={day.date.toISOString()}
                      onPress={() => setSelectedDate(day.date)}
                    />
                  ) : (
                    <View key={`empty-${index}`} style={styles.calendarEmptyCell} />
                  )
                )}
              </View>
            </View>
          </>
        ) : null}

        {activeTab === 'stats' ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>통계 요약</Text>
                <Text style={styles.sectionDescription}>
                  주간, 월간, 분기 흐름을 한 번에 봅니다.
                </Text>
              </View>
              <View style={styles.sectionChip}>
                <MaterialCommunityIcons
                  color={palette.textMuted}
                  name="chart-bell-curve-cumulative"
                  size={16}
                />
                <Text style={styles.sectionChipText}>집계</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                accentColor={getTrendColor(weekSummary.score)}
                icon="calendar-week"
                period={formatWeekRange(now)}
                summary={weekSummary}
                title="이번 주"
              />
              <StatCard
                accentColor={getTrendColor(monthSummary.score)}
                icon="calendar-month"
                period={formatMonthRange(now)}
                summary={monthSummary}
                title="이번 달"
              />
              <StatCard
                accentColor={getTrendColor(quarterSummary.score)}
                icon="calendar-range"
                period={formatQuarterRange(now)}
                summary={quarterSummary}
                title="이번 분기"
              />
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>최고 기록</Text>
                <Text style={styles.sectionDescription}>
                  월, 분기, 년 기준으로 가장 많이 오른 시기와 내린 시기를 봅니다.
                </Text>
              </View>
            <View style={styles.sectionChip}>
              <MaterialCommunityIcons color={palette.textMuted} name="trophy" size={16} />
              <Text style={styles.sectionChipText}>최고</Text>
            </View>
          </View>

            <View style={styles.bestGrid}>
              <BestRecordCard
                icon="calendar-month"
                records={monthBestRecords}
                title="월간 최고"
              />
              <BestRecordCard
                icon="calendar-range"
                records={quarterBestRecords}
                title="분기 최고"
              />
              <BestRecordCard
                icon="calendar"
                records={yearBestRecords}
                title="연간 최고"
              />
            </View>
          </>
        ) : null}
      </ScrollView>
      <BottomTabBar
        activeTab={activeTab}
        bottomInset={insets.bottom}
        onChange={setActiveTab}
      />
      {pendingUndoAction ? (
        <UndoSnackbar
          action={pendingUndoAction}
          bottomOffset={TAB_BAR_HEIGHT + insets.bottom + 16}
          onUndo={handleUndoAdd}
        />
      ) : null}
      <DayDetailModal
        entries={selectedDayEntries}
        onClose={() => setSelectedDate(null)}
        onReset={handleResetSelectedDay}
        selectedDate={selectedDate}
        summary={selectedDaySummary}
        trendColor={selectedDayTrendColor}
      />
      <InfoModal onClose={() => setIsInfoOpen(false)} visible={isInfoOpen} />
    </SafeAreaView>
  );
}

function MetricPill({
  accentColor,
  backgroundColor,
  icon,
  label,
  value,
}: {
  accentColor: string;
  backgroundColor: string;
  icon: IconName;
  label: string;
  value: number;
}) {
  return (
    <View style={[styles.metricPill, { backgroundColor }]}>
      <View style={[styles.metricPillIcon, { backgroundColor: `${accentColor}20` }]}>
        <MaterialCommunityIcons color={accentColor} name={icon} size={18} />
      </View>
      <View style={styles.metricPillCopy}>
        <Text style={styles.metricPillLabel}>{label}</Text>
        <Text style={[styles.metricPillValue, { color: accentColor }]}>{value}</Text>
      </View>
    </View>
  );
}

function ActionButton({
  colors,
  icon,
  kind,
  label,
  onLongPress,
  onPressOut,
  onPress,
  subtitle,
  iconColor,
  labelColor,
  subtitleColor,
}: {
  colors: readonly [string, string];
  icon: IconName;
  kind: VoteKind;
  label: string;
  onLongPress: (kind: VoteKind) => void;
  onPressOut: () => void;
  onPress: () => void;
  subtitle: string;
  iconColor: string;
  labelColor: string;
  subtitleColor: string;
}) {
  return (
    <Pressable
      delayLongPress={350}
      onLongPress={() => onLongPress(kind)}
      onPress={onPress}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.actionButtonWrap,
        pressed && styles.buttonPressed,
      ]}
    >
      <LinearGradient
        colors={colors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.actionButton}
      >
        <View style={styles.actionButtonIcon}>
          <MaterialCommunityIcons color={iconColor} name={icon} size={28} />
        </View>
        <Text style={[styles.actionButtonLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.actionButtonSubtitle, { color: subtitleColor }]}>
          {subtitle}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

function CalendarDayCell({
  day,
  onPress,
}: {
  day: CalendarDay;
  onPress: () => void;
}) {
  const trendColor = day.summary.total > 0 ? getTrendColor(day.summary.score) : palette.textSoft;
  const hasEntries = day.summary.total > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.calendarCell,
        {
          backgroundColor: hasEntries ? getTrendSoft(day.summary.score) : 'rgba(255,255,255,0.64)',
          borderColor: day.isToday
            ? `${trendColor}50`
            : hasEntries
              ? `${trendColor}22`
              : 'rgba(82, 92, 122, 0.08)',
        },
        pressed && styles.calendarCellPressed,
      ]}
    >
      <Text
        style={[
          styles.calendarDayNumber,
          { color: day.isToday ? trendColor : palette.text },
        ]}
      >
        {day.dayNumber}
      </Text>
      <Text style={[styles.calendarDayScore, { color: trendColor }]}>
        {hasEntries ? formatScore(day.summary.score) : ''}
      </Text>
      <Text style={styles.calendarDayCount}>
        {hasEntries ? `${day.summary.total}건` : ''}
      </Text>
    </Pressable>
  );
}

function StatCard({
  accentColor,
  icon,
  period,
  summary,
  title,
}: {
  accentColor: string;
  icon: IconName;
  period: string;
  summary: VoteSummary;
  title: string;
}) {
  return (
    <View
      style={[
        styles.statCard,
        {
          borderColor: `${accentColor}20`,
          backgroundColor: getTrendSurface(summary.score),
        },
      ]}
    >
      <View style={styles.statCardHeader}>
        <View style={[styles.statCardIcon, { backgroundColor: `${accentColor}18` }]}>
          <MaterialCommunityIcons color={accentColor} name={icon} size={20} />
        </View>
        <View>
          <Text style={styles.statCardTitle}>{title}</Text>
          <Text style={styles.statCardPeriod}>{period}</Text>
        </View>
      </View>

      <Text style={[styles.statCardScore, { color: accentColor }]}>
        {formatScore(summary.score)}
      </Text>

      <View style={styles.statCardDetails}>
        <Text style={[styles.statDetail, { color: palette.rise }]}>상승 {summary.upCount}</Text>
        <Text style={[styles.statDetail, { color: palette.fall }]}>하락 {summary.downCount}</Text>
        <Text style={styles.statDetail}>총 {summary.total}</Text>
      </View>
    </View>
  );
}

function BestRecordCard({
  icon,
  records,
  title,
}: {
  icon: IconName;
  records: {
    upRecord: BestPeriodRecord | null;
    downRecord: BestPeriodRecord | null;
  };
  title: string;
}) {
  return (
    <View style={styles.bestCard}>
      <View style={styles.bestCardHeader}>
        <View style={styles.bestCardIcon}>
          <MaterialCommunityIcons color={palette.text} name={icon} size={18} />
        </View>
        <Text style={styles.bestCardTitle}>{title}</Text>
      </View>

      <View style={styles.bestCardRows}>
        <BestRecordRow
          accentColor={palette.rise}
          icon="arrow-top-right-thick"
          label="최고 상승"
          record={records.upRecord}
        />
        <BestRecordRow
          accentColor={palette.fall}
          icon="arrow-bottom-left-thick"
          label="최고 하락"
          record={records.downRecord}
        />
      </View>
    </View>
  );
}

function BestRecordRow({
  accentColor,
  icon,
  label,
  record,
}: {
  accentColor: string;
  icon: IconName;
  label: string;
  record: BestPeriodRecord | null;
}) {
  return (
    <View
      style={[
        styles.recordRow,
        {
          backgroundColor: record ? `${accentColor}0F` : 'rgba(255,255,255,0.68)',
          borderColor: record ? `${accentColor}1F` : palette.border,
        },
      ]}
    >
      <View style={[styles.recordRowIcon, { backgroundColor: `${accentColor}18` }]}>
        <MaterialCommunityIcons color={accentColor} name={icon} size={18} />
      </View>

      <View style={styles.recordRowCopy}>
        <Text style={styles.recordRowLabel}>{label}</Text>
        <Text style={styles.recordRowPeriod}>
          {record ? record.label : '아직 기록 없음'}
        </Text>
      </View>

      <View style={styles.recordRowValueWrap}>
        <Text style={[styles.recordRowValue, { color: accentColor }]}>
          {record ? `${record.count}회` : '-'}
        </Text>
        {record ? (
          <Text style={styles.recordRowMeta}>
            {`점수 ${formatScore(record.summary.score)}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function UndoSnackbar({
  action,
  bottomOffset,
  onUndo,
}: {
  action: PendingUndoAction;
  bottomOffset: number;
  onUndo: () => void;
}) {
  const isRise = action.kind === 'up';
  const accentColor = isRise ? palette.rise : palette.fall;
  const colors = isRise
    ? (['#FFE8EC', '#FFC3CC'] as const)
    : (['#EAF2FF', '#C7DDFF'] as const);
  const addedCount = action.entries.length;
  const title = isRise
    ? `상승 기록 ${addedCount}건이 추가됐어요`
    : `하락 기록 ${addedCount}건이 추가됐어요`;
  const subtitle =
    addedCount > 1
      ? '롱프레스 묶음 입력을 되돌릴 수 있어요.'
      : action.note || (isRise ? '칭찬 기록이 저장됐어요.' : '주의 기록이 저장됐어요.');
  const icon = isRise ? 'arrow-top-right-thick' : 'arrow-bottom-left-thick';

  return (
    <View pointerEvents="box-none" style={[styles.undoWrap, { bottom: bottomOffset }]}>
      <LinearGradient
        colors={colors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.undoCard, { borderColor: `${accentColor}24` }]}
      >
        <View style={[styles.undoIcon, { backgroundColor: `${accentColor}18` }]}>
          <MaterialCommunityIcons color={accentColor} name={icon} size={20} />
        </View>

        <View style={styles.undoCopy}>
          <Text numberOfLines={1} style={styles.undoTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.undoSubtitle}>
            {subtitle}
          </Text>
        </View>

        <Pressable
          onPress={onUndo}
          style={({ pressed }) => [styles.undoButton, pressed && styles.undoPressed]}
        >
          <Text style={[styles.undoButtonText, { color: accentColor }]}>되돌리기</Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

function BottomTabBar({
  activeTab,
  bottomInset,
  onChange,
}: {
  activeTab: TabKey;
  bottomInset: number;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <View style={[styles.tabBarWrap, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <View style={styles.tabBar}>
        <TabBarButton
          accentColor={palette.rise}
          active={activeTab === 'home'}
          icon="thumb-up-outline"
          label="업다운"
          onPress={() => onChange('home')}
        />
        <TabBarButton
          accentColor={palette.fall}
          active={activeTab === 'calendar'}
          icon="calendar-month"
          label="달력"
          onPress={() => onChange('calendar')}
        />
        <TabBarButton
          accentColor={palette.sun}
          active={activeTab === 'stats'}
          icon="chart-bell-curve-cumulative"
          label="통계"
          onPress={() => onChange('stats')}
        />
      </View>
    </View>
  );
}

function InfoModal({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.infoModalCard}>
          <View style={styles.dayModalHeader}>
            <View>
              <Text style={styles.dayModalTitle}>Thumbi</Text>
              <Text style={styles.dayModalDate}>간단한 기록과 통계를 위한 앱</Text>
            </View>
            <Pressable onPress={onClose} style={styles.dayModalClose}>
              <MaterialCommunityIcons color={palette.textMuted} name="close" size={20} />
            </Pressable>
          </View>

          <View style={styles.infoList}>
            <InfoRow
              icon="thumb-up-outline"
              text="업다운 탭에서 바로 기록하고 되돌릴 수 있어요."
            />
            <InfoRow
              icon="lightning-bolt"
              text="길게 누르면 1초마다 5건씩 연속 입력돼요."
            />
            <InfoRow
              icon="calendar-month"
              text="달력 탭에서 날짜별 기록을 보고 초기화할 수 있어요."
            />
            <InfoRow
              icon="chart-bell-curve-cumulative"
              text="통계 탭에서 주간, 월간, 분기 흐름과 최고 기록을 봅니다."
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({
  icon,
  text,
}: {
  icon: IconName;
  text: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowIcon}>
        <MaterialCommunityIcons color={palette.textMuted} name={icon} size={16} />
      </View>
      <Text style={styles.infoRowText}>{text}</Text>
    </View>
  );
}

function TabBarButton({
  accentColor,
  active,
  icon,
  label,
  onPress,
}: {
  accentColor: string;
  active: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const textColor = active ? palette.text : palette.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active && { backgroundColor: `${accentColor}22` },
        pressed && styles.tabButtonPressed,
      ]}
    >
      <MaterialCommunityIcons color={textColor} name={icon} size={20} />
      <Text style={[styles.tabButtonLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function DayDetailModal({
  entries,
  onClose,
  onReset,
  selectedDate,
  summary,
  trendColor,
}: {
  entries: VoteEntry[];
  onClose: () => void;
  onReset: () => void;
  selectedDate: Date | null;
  summary: VoteSummary | null;
  trendColor: string;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(selectedDate)}
    >
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.dayModalCard}>
          <View style={styles.dayModalHeader}>
            <View>
              <Text style={styles.dayModalTitle}>일별 상세</Text>
              <Text style={styles.dayModalDate}>
                {selectedDate ? formatDateLabel(selectedDate) : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.dayModalClose}>
              <MaterialCommunityIcons color={palette.textMuted} name="close" size={20} />
            </Pressable>
          </View>

          <View style={styles.dayModalStats}>
            <View
              style={[
                styles.dayModalStat,
                { backgroundColor: summary ? getTrendSoft(summary.score) : palette.panel },
              ]}
            >
              <Text style={styles.dayModalStatLabel}>점수</Text>
              <Text style={[styles.dayModalStatValue, { color: trendColor }]}>
                {summary ? formatScore(summary.score) : '0'}
              </Text>
            </View>
            <View style={styles.dayModalSummaryRow}>
              <MetricPill
                accentColor={palette.rise}
                backgroundColor={palette.riseSoft}
                icon="arrow-top-right-thick"
                label="상승"
                value={summary?.upCount ?? 0}
              />
              <MetricPill
                accentColor={palette.fall}
                backgroundColor={palette.fallSoft}
                icon="arrow-bottom-left-thick"
                label="하락"
                value={summary?.downCount ?? 0}
              />
            </View>
          </View>

          <View style={styles.dayEntriesSection}>
            <Text style={styles.dayEntriesTitle}>그날 남긴 기록</Text>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>이 날짜에는 아직 기록이 없어요.</Text>
            ) : (
              <View style={styles.dayEntriesList}>
                {entries.slice(0, 6).map((entry) => (
                  <View key={entry.id} style={styles.dayEntryRow}>
                    <View
                      style={[
                        styles.dayEntryDot,
                        {
                          backgroundColor:
                            entry.kind === 'up' ? palette.riseSoft : palette.fallSoft,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        color={entry.kind === 'up' ? palette.rise : palette.fall}
                        name={
                          entry.kind === 'up'
                            ? 'arrow-top-right-thick'
                            : 'arrow-bottom-left-thick'
                        }
                        size={14}
                      />
                    </View>
                    <View style={styles.dayEntryCopy}>
                      <Text style={styles.dayEntryTitle}>
                        {entry.note || (entry.kind === 'up' ? '칭찬 기록' : '주의 기록')}
                      </Text>
                      <Text style={styles.dayEntryMeta}>
                        {formatEntryTimestamp(entry.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Pressable
            disabled={entries.length === 0}
            onPress={onReset}
            style={({ pressed }) => [
              styles.resetButton,
              entries.length === 0 && styles.resetButtonDisabled,
              pressed && entries.length > 0 && styles.resetButtonPressed,
            ]}
          >
            <MaterialCommunityIcons color="#FFFFFF" name="delete-alert-outline" size={18} />
            <Text style={styles.resetButtonText}>이 날짜 기록 초기화</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function EntryRow({
  entry,
  onDelete,
}: {
  entry: VoteEntry;
  onDelete: (entry: VoteEntry) => void;
}) {
  const accentColor = getEntryAccent(entry.kind);
  const backgroundColor = getEntrySoft(entry.kind);
  const title = entry.note || (entry.kind === 'up' ? '칭찬 기록' : '주의 기록');

  return (
    <View
      style={[
        styles.entryRow,
        {
          backgroundColor: `${accentColor}0F`,
          borderColor: `${accentColor}1F`,
        },
      ]}
    >
      <View style={[styles.entryIcon, { backgroundColor }]}>
        <MaterialCommunityIcons
          color={accentColor}
          name={entry.kind === 'up' ? 'arrow-top-right-thick' : 'arrow-bottom-left-thick'}
          size={18}
        />
      </View>

      <View style={styles.entryCopy}>
        <Text style={styles.entryTitle}>{title}</Text>
        <Text style={styles.entryMeta}>{formatEntryTimestamp(entry.createdAt)}</Text>
      </View>

      <Pressable
        hitSlop={10}
        onPress={() => onDelete(entry)}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
      >
        <MaterialCommunityIcons color={palette.textMuted} name="trash-can-outline" size={18} />
      </Pressable>
    </View>
  );
}

function getTrendColor(score: number): string {
  if (score > 0) {
    return palette.rise;
  }

  if (score < 0) {
    return palette.fall;
  }

  return palette.text;
}

function getTrendSoft(score: number): string {
  if (score > 0) {
    return palette.riseSoft;
  }

  if (score < 0) {
    return palette.fallSoft;
  }

  return 'rgba(255,255,255,0.82)';
}

function getTrendSurface(score: number): string {
  if (score > 0) {
    return 'rgba(255, 93, 112, 0.07)';
  }

  if (score < 0) {
    return 'rgba(93, 168, 255, 0.08)';
  }

  return palette.panel;
}

function getEntryAccent(kind: VoteKind): string {
  return kind === 'up' ? palette.rise : palette.fall;
}

function getEntrySoft(kind: VoteKind): string {
  return kind === 'up' ? palette.riseSoft : palette.fallSoft;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  backgroundOrbs: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.85,
  },
  orbRise: {
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    backgroundColor: palette.riseGlow,
  },
  orbFall: {
    top: 280,
    left: -70,
    width: 180,
    height: 180,
    backgroundColor: palette.fallGlow,
  },
  orbSun: {
    right: -30,
    bottom: 100,
    width: 190,
    height: 190,
    backgroundColor: palette.cream,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 18,
  },
  topBarShell: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: palette.border,
  },
  brandIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  brandText: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
  },
  brandInfoButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  brandInfoPressed: {
    opacity: 0.7,
  },
  heroCard: {
    borderRadius: 32,
    padding: 22,
    gap: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#7B8BB0',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 8,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
  },
  scoreBubble: {
    minWidth: 96,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: palette.border,
  },
  scoreLabel: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  scoreValue: {
    marginTop: 4,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricPillIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricPillCopy: {
    gap: 1,
  },
  metricPillLabel: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  metricPillValue: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
  },
  inputCard: {
    gap: 10,
  },
  inputLabel: {
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
  },
  noteInput: {
    minHeight: 88,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
  },
  actionButtonWrap: {
    flex: 1,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
  },
  actionButton: {
    minHeight: 156,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderRadius: 28,
    justifyContent: 'space-between',
    shadowColor: '#2B3443',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
  },
  actionButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  actionButtonLabel: {
    marginTop: 18,
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '700',
  },
  actionButtonSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
  },
  sectionDescription: {
    marginTop: 4,
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionChipText: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  statsGrid: {
    gap: 12,
  },
  bestGrid: {
    gap: 12,
  },
  calendarCard: {
    borderRadius: 28,
    padding: 16,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarWeekday: {
    width: '14.285%',
    textAlign: 'center',
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  calendarCell: {
    width: '13.1%',
    aspectRatio: 0.9,
    borderRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  calendarCellPressed: {
    opacity: 0.82,
  },
  calendarEmptyCell: {
    width: '13.1%',
    aspectRatio: 0.9,
  },
  calendarDayNumber: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
  },
  calendarDayScore: {
    fontFamily: fonts.display,
    fontSize: 12,
    fontWeight: '800',
  },
  calendarDayCount: {
    marginBottom: 8,
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
  },
  statCard: {
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    gap: 18,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCardTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
  },
  statCardPeriod: {
    marginTop: 2,
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  statCardScore: {
    fontFamily: fonts.display,
    fontSize: 42,
    fontWeight: '800',
  },
  statCardDetails: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  statDetail: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.78)',
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
  bestCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 14,
  },
  bestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bestCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  bestCardTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
  },
  bestCardRows: {
    gap: 10,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  recordRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRowCopy: {
    flex: 1,
    gap: 2,
  },
  recordRowLabel: {
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
  recordRowPeriod: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  recordRowValueWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  recordRowValue: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '800',
  },
  recordRowMeta: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  recentCard: {
    borderRadius: 30,
    padding: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 18,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  emptyStateIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  emptyTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  entriesList: {
    gap: 12,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(82, 92, 122, 0.08)',
  },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCopy: {
    flex: 1,
    gap: 3,
  },
  entryTitle: {
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
  },
  entryMeta: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  deletePressed: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
    backgroundColor: 'rgba(24, 30, 44, 0.18)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dayModalCard: {
    borderRadius: 30,
    padding: 20,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    gap: 18,
    shadowColor: '#5B6880',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 10,
  },
  dayModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayModalTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
  },
  dayModalDate: {
    marginTop: 4,
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  dayModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  dayModalStats: {
    gap: 12,
  },
  dayModalStat: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(82, 92, 122, 0.08)',
  },
  dayModalStatLabel: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  dayModalStatValue: {
    marginTop: 6,
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '800',
  },
  dayModalSummaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dayEntriesSection: {
    gap: 10,
  },
  dayEntriesTitle: {
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
  },
  dayEntriesList: {
    gap: 10,
  },
  infoModalCard: {
    borderRadius: 30,
    padding: 20,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    gap: 18,
    shadowColor: '#5B6880',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 10,
  },
  infoList: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(82, 92, 122, 0.08)',
  },
  infoRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  infoRowText: {
    flex: 1,
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  dayEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(82, 92, 122, 0.08)',
  },
  dayEntryDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEntryCopy: {
    flex: 1,
    gap: 2,
  },
  dayEntryTitle: {
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  dayEntryMeta: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 20,
    backgroundColor: '#EA5B65',
  },
  resetButtonDisabled: {
    opacity: 0.45,
  },
  resetButtonPressed: {
    opacity: 0.82,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  undoWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  undoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#6F7E99',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 10,
  },
  undoIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoCopy: {
    flex: 1,
    gap: 2,
  },
  undoTitle: {
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  undoSubtitle: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  undoButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  undoPressed: {
    opacity: 0.72,
  },
  undoButtonText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  tabBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 10,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    shadowColor: '#6B7892',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 14,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 20,
  },
  tabButtonPressed: {
    opacity: 0.78,
  },
  tabButtonLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
});
