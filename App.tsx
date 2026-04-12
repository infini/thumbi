import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import PagerView from 'react-native-pager-view';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  Animated,
  Alert,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
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
  formatYearRange,
  getDaySummary,
  getEntriesForDay,
  getBestPeriodRecords,
  getMonthCalendar,
  getMonthSummary,
  getQuarterSummary,
  getScoreSeries,
  getTodaySummary,
  getWeekSummary,
  getYearSummary,
  isVoteEntry,
  sortEntries,
  STORAGE_KEY,
  type ScoreSeriesPeriod,
  type ScoreSeriesPoint,
  type VoteEntry,
  type VoteKind,
  type VoteSummary,
} from './src/lib/records';
import {
  darkPalette,
  fonts,
  getPalette,
  type Palette,
} from './src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
const UNDO_TIMEOUT_MS = 5000;
const REPEAT_STEP = 5;
const REPEAT_INTERVAL_MS = 1000;
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const TAB_BAR_HEIGHT = 76;
const TAB_ORDER: TabKey[] = ['home', 'calendar', 'stats'];

interface PendingUndoAction {
  entries: VoteEntry[];
  kind: VoteKind;
  note: string;
}

type TabKey = 'home' | 'calendar' | 'stats';

interface RecentRecordGroup {
  key: string;
  ids: string[];
  kind: VoteKind;
  note: string;
  createdAt: string;
  points: number;
}

interface StatsCardData {
  icon: IconName;
  key: ScoreSeriesPeriod;
  title: string;
  period: string;
  summary: VoteSummary;
  accentColor: string;
}

type AppStyles = ReturnType<typeof createStyles>;

interface ThemeContextValue {
  isDark: boolean;
  palette: Palette;
  styles: AppStyles;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export default function App() {
  const colorScheme = useColorScheme();
  const palette = useMemo(() => getPalette(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider
        value={{
          isDark: colorScheme === 'dark',
          palette,
          styles,
        }}
      >
        <AppContent />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function useAppTheme() {
  const theme = useContext(ThemeContext);

  if (!theme) {
    throw new Error('useAppTheme must be used within ThemeContext.Provider');
  }

  return theme;
}

function AppContent() {
  const { isDark, palette, styles } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<VoteEntry[]>([]);
  const [draftNote, setDraftNote] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingUndoAction, setPendingUndoAction] =
    useState<PendingUndoAction | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [statsModalPeriod, setStatsModalPeriod] =
    useState<ScoreSeriesPeriod | null>(null);
  const [isStatsModalVisible, setIsStatsModalVisible] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const pagerRef = useRef<PagerView | null>(null);
  const tabPosition = useRef(new Animated.Value(0)).current;
  const statsModalProgress = useRef(new Animated.Value(0)).current;
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipNextPressRef = useRef(false);
  const holdBatchEntriesRef = useRef<VoteEntry[]>([]);
  const holdBatchIdRef = useRef<string | null>(null);
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
  const yearSummary = getYearSummary(entries, now);
  const monthBestRecords = getBestPeriodRecords(entries, 'month');
  const quarterBestRecords = getBestPeriodRecords(entries, 'quarter');
  const yearBestRecords = getBestPeriodRecords(entries, 'year');
  const calendarDays = getMonthCalendar(entries, calendarCursor);
  const recentEntries = getRecentRecordGroups(entries).slice(0, 6);
  const todayScoreColor = getTrendColor(todaySummary.score, palette);
  const selectedDaySummary = selectedDate ? getDaySummary(entries, selectedDate) : null;
  const selectedDayEntries = selectedDate ? getEntriesForDay(entries, selectedDate) : [];
  const selectedDayTrendColor = selectedDaySummary
    ? getTrendColor(selectedDaySummary.score, palette)
    : palette.text;
  const statsCards: StatsCardData[] = [
    {
      icon: 'calendar-week',
      key: 'week',
      title: '주간',
      period: formatCompactWeekRange(now),
      summary: weekSummary,
      accentColor: getTrendColor(weekSummary.score, palette),
    },
    {
      icon: 'calendar-month',
      key: 'month',
      title: '월간',
      period: formatCompactMonthRange(now),
      summary: monthSummary,
      accentColor: getTrendColor(monthSummary.score, palette),
    },
    {
      icon: 'calendar-range',
      key: 'quarter',
      title: '분기',
      period: formatCompactQuarterRange(now),
      summary: quarterSummary,
      accentColor: getTrendColor(quarterSummary.score, palette),
    },
    {
      icon: 'calendar',
      key: 'year',
      title: '연간',
      period: formatCompactYearRange(now),
      summary: yearSummary,
      accentColor: getTrendColor(yearSummary.score, palette),
    },
  ];
  const selectedStatCard = statsModalPeriod
    ? statsCards.find((card) => card.key === statsModalPeriod) ?? statsCards[0]
    : null;
  const selectedScoreSeries = selectedStatCard
    ? getScoreSeries(entries, selectedStatCard.key, now)
    : [];
  const scrollBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 72;

  function getTabIndex(tab: TabKey): number {
    return TAB_ORDER.indexOf(tab);
  }

  function changeTab(nextTab: TabKey) {
    if (nextTab === activeTab) {
      return;
    }

    const nextIndex = getTabIndex(nextTab);
    setActiveTab(nextTab);
    pagerRef.current?.setPage(nextIndex);
  }

  function openStatsModal(period: ScoreSeriesPeriod) {
    setStatsModalPeriod(period);
    setIsStatsModalVisible(true);
    statsModalProgress.stopAnimation();
    statsModalProgress.setValue(0);
    Animated.timing(statsModalProgress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function closeStatsModal() {
    statsModalProgress.stopAnimation();
    Animated.timing(statsModalProgress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsStatsModalVisible(false);
        setStatsModalPeriod(null);
      }
    });
  }

  function switchStatsModalPeriod(period: ScoreSeriesPeriod) {
    setStatsModalPeriod(period);
  }

  function renderHomeTab() {
    const heroColors = isDark
      ? (['#14201E', '#101715', '#0E1413'] as const)
      : (['#E8FBF6', '#FFFFFF', '#EEF5F3'] as const);
    const riseButtonColors = isDark
      ? (['#1B3632', '#24554E'] as const)
      : (['#D7FAF4', '#92E5D9'] as const);
    const fallButtonColors = isDark
      ? (['#1A2735', '#284966'] as const)
      : (['#E4F0FB', '#AACFF0'] as const);

    return (
      <>
        <LinearGradient
          colors={heroColors}
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
                  backgroundColor: getTrendSoft(todaySummary.score, palette),
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
                icon="thumb-up-outline"
                label="엄지 척!!"
                value={todaySummary.upCount}
              />
              <MetricPill
                accentColor={palette.fall}
                backgroundColor={palette.fallSoft}
                icon="thumb-down-outline"
                label="이건 좀.."
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
              colors={riseButtonColors}
              icon="thumb-up"
              kind="up"
              label="엄지 척!!"
              onLongPress={handleRepeatStart}
              onPressOut={stopRepeatInput}
              onPress={() => handleAddEntry('up')}
              iconColor={palette.rise}
              labelColor="#0F5B54"
            />
            <ActionButton
              colors={fallButtonColors}
              icon="thumb-down"
              kind="down"
              label="이건 좀.."
              onLongPress={handleRepeatStart}
              onPressOut={stopRepeatInput}
              onPress={() => handleAddEntry('down')}
              iconColor={palette.fall}
              labelColor="#1F4F89"
            />
          </View>
        </LinearGradient>

        <View style={styles.recentCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>최근 기록</Text>
              <Text style={styles.sectionDescription}>
                가장 최근에 남긴 {recentEntries.length}개의 액션입니다.
              </Text>
            </View>
          </View>

          {!isHydrated ? (
            <Text style={styles.emptyText}>기록을 불러오는 중이에요.</Text>
          ) : recentEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <MaterialCommunityIcons
                  color={palette.brand}
                  name="thumb-up-outline"
                  size={24}
                />
              </View>
              <Text style={styles.emptyTitle}>첫 기록을 남겨보세요</Text>
              <Text style={styles.emptyText}>아래 버튼으로 첫 기록을 남겨보세요.</Text>
            </View>
          ) : (
            <View style={styles.entriesList}>
              {recentEntries.map((entry) => (
                <EntryRow entry={entry} key={entry.key} onDelete={handleDeleteEntry} />
              ))}
            </View>
          )}
        </View>
      </>
    );
  }

  function renderCalendarTab() {
    return (
      <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>월간 달력</Text>
        </View>

        <View style={[styles.calendarCard, styles.calendarCardWide]}>
          <View style={styles.calendarHeader}>
            <View>
              <Text style={styles.calendarTitle}>{formatMonthRange(calendarCursor)}</Text>
            </View>
            <View style={styles.calendarNav}>
              <CalendarNavButton
                icon="chevron-double-left"
                onPress={() => shiftCalendarYear(-1)}
              />
              <CalendarNavButton
                icon="chevron-left"
                onPress={() => shiftCalendarMonth(-1)}
              />
              <CalendarNavButton
                icon="chevron-right"
                onPress={() => shiftCalendarMonth(1)}
              />
              <CalendarNavButton
                icon="chevron-double-right"
                onPress={() => shiftCalendarYear(1)}
              />
            </View>
          </View>
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
    );
  }

  function renderStatsTab() {
    return (
      <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>통계</Text>
        </View>

        <View style={styles.statsGrid}>
          {statsCards.map((card) => (
            <StatCard
              accentColor={card.accentColor}
              key={card.key}
              onPress={() => openStatsModal(card.key)}
              period={card.period}
              summary={card.summary}
              title={card.title}
            />
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>최고 기록</Text>
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
    );
  }

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
    const batchId =
      holdBatchIdRef.current ??
      `batch-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    holdBatchIdRef.current = batchId;
    const batchTimestamp = Date.now();
    const createdEntries = Array.from({ length: count }, () =>
      createVoteEntry(kind, note, {
        batchId,
        createdAt: new Date(batchTimestamp).toISOString(),
      })
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
    holdBatchIdRef.current = null;
    holdNoteRef.current = '';
  }

  function shiftCalendarMonth(offset: number) {
    setCalendarCursor(
      (currentCursor) =>
        new Date(currentCursor.getFullYear(), currentCursor.getMonth() + offset, 1)
    );
  }

  function shiftCalendarYear(offset: number) {
    setCalendarCursor(
      (currentCursor) =>
        new Date(currentCursor.getFullYear() + offset, currentCursor.getMonth(), 1)
    );
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

  function handleDeleteEntry(group: RecentRecordGroup) {
    const targetIds = new Set(group.ids);

    Alert.alert(
      '기록 삭제',
      group.note
        ? `"${group.note}" 기록을 지울까요?`
        : group.points > 1
          ? `${group.points}점 묶음 기록을 지울까요?`
          : '이 기록을 지울까요?',
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
              currentEntries.filter((currentEntry) => !targetIds.has(currentEntry.id))
            );
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        <View style={[styles.orb, styles.orbRise]} />
        <View style={[styles.orb, styles.orbFall]} />
        <View style={[styles.orb, styles.orbSun]} />
      </View>
      <View style={styles.contentShell}>
        <View style={styles.topBarShell}>
          <View style={styles.topBar}>
            <View style={styles.brandBadge}>
              <View style={styles.brandIcon}>
                <MaterialCommunityIcons
                  color={palette.brand}
                  name="thumb-up-outline"
                  size={18}
                />
              </View>
              <Text style={styles.brandText}>
                <Text style={styles.brandLetterText}>A</Text>
                <Text style={styles.brandRestText}>ll </Text>
                <Text style={styles.brandLetterText}>W</Text>
                <Text style={styles.brandRestText}>e </Text>
                <Text style={styles.brandLetterText}>E</Text>
                <Text style={styles.brandRestText}>xperience</Text>
              </Text>
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
        <PagerView
          initialPage={0}
          onPageScroll={(event) => {
            tabPosition.setValue(
              event.nativeEvent.position + event.nativeEvent.offset
            );
          }}
          onPageSelected={(event) => {
            const nextTab = TAB_ORDER[event.nativeEvent.position];
            if (nextTab) {
              setActiveTab(nextTab);
            }
          }}
          ref={pagerRef}
          style={styles.pager}
        >
          <View key="home" style={styles.pagerPage}>
            <ScrollView
              contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderHomeTab()}
            </ScrollView>
          </View>
          <View key="calendar" style={styles.pagerPage}>
            <ScrollView
              contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderCalendarTab()}
            </ScrollView>
          </View>
          <View key="stats" style={styles.pagerPage}>
            <ScrollView
              contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderStatsTab()}
            </ScrollView>
          </View>
        </PagerView>
      </View>
      <BottomTabBar
        activeTab={activeTab}
        bottomInset={insets.bottom}
        onChange={changeTab}
        tabPosition={tabPosition}
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
      <StatsDetailModal
        cards={statsCards}
        onClose={closeStatsModal}
        onSelectPeriod={switchStatsModalPeriod}
        progress={statsModalProgress}
        selectedCard={selectedStatCard}
        series={selectedScoreSeries}
        visible={isStatsModalVisible}
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
  const { styles } = useAppTheme();

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
  iconColor,
  labelColor,
}: {
  colors: readonly [string, string];
  icon: IconName;
  kind: VoteKind;
  label: string;
  onLongPress: (kind: VoteKind) => void;
  onPressOut: () => void;
  onPress: () => void;
  iconColor: string;
  labelColor: string;
}) {
  const { styles } = useAppTheme();

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
  const { palette, styles } = useAppTheme();
  const trendColor =
    day.summary.total > 0 ? getTrendColor(day.summary.score, palette) : palette.textSoft;
  const hasEntries = day.summary.total > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.calendarCell,
        {
          backgroundColor: hasEntries
            ? getTrendSoft(day.summary.score, palette)
            : palette.panel,
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
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[
          styles.calendarDayNumber,
          { color: day.isToday ? trendColor : palette.text },
        ]}
      >
        {day.dayNumber}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        numberOfLines={1}
        style={[styles.calendarDayScore, { color: trendColor }]}
      >
        {hasEntries ? formatScore(day.summary.score) : ''}
      </Text>
    </Pressable>
  );
}

function CalendarNavButton({
  icon,
  onPress,
}: {
  icon: IconName;
  onPress: () => void;
}) {
  const { palette, styles } = useAppTheme();

  return (
    <Pressable
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.calendarNavButton, pressed && styles.calendarNavPressed]}
    >
      <MaterialCommunityIcons color={palette.textMuted} name={icon} size={18} />
    </Pressable>
  );
}

function StatCard({
  accentColor,
  onPress,
  period,
  summary,
  title,
}: {
  accentColor: string;
  onPress: () => void;
  period: string;
  summary: VoteSummary;
  title: string;
}) {
  const { palette, styles } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statCard,
        {
          borderColor: `${accentColor}20`,
          backgroundColor: getTrendSurface(summary.score, palette),
        },
        pressed && styles.statCardPressed,
      ]}
    >
      <View style={styles.statCardTop}>
        <Text style={styles.statCardTitle}>{title}</Text>
        <View style={styles.statCardPeriodBadge}>
          <Text style={styles.statCardPeriod}>{period}</Text>
        </View>
      </View>

      <Text style={[styles.statCardScore, { color: accentColor }]}>
        {formatScore(summary.score)}
      </Text>

      <View style={styles.statCardDetails}>
        <Text style={[styles.statDetail, { color: palette.rise }]}>
          {`엄지 척!! ${summary.upCount}`}
        </Text>
        <Text style={[styles.statDetail, { color: palette.fall }]}>
          {`이건 좀.. ${summary.downCount}`}
        </Text>
      </View>
    </Pressable>
  );
}

function ScoreChartCard({
  accentColor,
  period,
  series,
  summary,
  title,
}: {
  accentColor: string;
  period: string;
  series: ScoreSeriesPoint[];
  summary: VoteSummary;
  title: string;
}) {
  const { isDark, palette, styles } = useAppTheme();
  const hasEntries = series.some((point) => point.total > 0);
  const highestPoint = series.reduce<ScoreSeriesPoint | null>((best, point) => {
    if (point.total === 0) {
      return best;
    }

    if (!best || point.score > best.score) {
      return point;
    }

    return best;
  }, null);
  const lowestPoint = series.reduce<ScoreSeriesPoint | null>((best, point) => {
    if (point.total === 0) {
      return best;
    }

    if (!best || point.score < best.score) {
      return point;
    }

    return best;
  }, null);
  const maxAbsScore = Math.max(1, ...series.map((point) => Math.abs(point.score)));
  const barWidth = series.length > 20 ? 14 : series.length > 12 ? 18 : 24;
  const columnGap = series.length > 20 ? 6 : 8;
  const plotWidth = Math.max(
    series.length * barWidth + Math.max(series.length - 1, 0) * columnGap,
    280
  );
  const summaryColor = summary.total > 0 ? accentColor : palette.text;
  const highestColor = highestPoint
    ? getTrendColor(highestPoint.score, palette)
    : palette.text;
  const lowestColor = lowestPoint
    ? getTrendColor(lowestPoint.score, palette)
    : palette.text;

  return (
    <View
      style={[
        styles.scoreChartCard,
        {
          borderColor: `${summaryColor}1F`,
          backgroundColor: getTrendSurface(summary.score, palette),
        },
      ]}
    >
      <View style={styles.scoreChartHeader}>
        <View style={styles.scoreChartCopy}>
          <Text style={styles.scoreChartTitle}>{title}</Text>
          <Text style={styles.scoreChartSubtitle}>{period}</Text>
        </View>

        <View
          style={[
            styles.scoreChartScoreBadge,
            {
              backgroundColor: getTrendSoft(summary.score, palette),
              borderColor: `${summaryColor}1F`,
            },
          ]}
        >
          <Text style={styles.scoreChartScoreLabel}>기간 점수</Text>
          <Text style={[styles.scoreChartScoreValue, { color: summaryColor }]}>
            {formatScore(summary.score)}
          </Text>
        </View>
      </View>

      <View style={styles.scoreChartFrame}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scoreChartScroll}
        >
          <View style={[styles.scoreChartPlot, { width: plotWidth }]}>
            <View
              style={[
                styles.scoreChartBaseline,
                {
                  backgroundColor: isDark
                    ? 'rgba(223, 248, 244, 0.12)'
                    : 'rgba(12, 18, 16, 0.10)',
                },
              ]}
            />
            {series.map((point, index) => {
              const barColor = getTrendColor(point.score, palette);
              const hasActivity = point.total > 0;
              const barHeight =
                !hasActivity || point.score === 0
                  ? 0
                  : Math.max(
                      10,
                      Math.round((Math.abs(point.score) / maxAbsScore) * 56)
                    );

              return (
                <View
                  key={point.key}
                  style={[
                    styles.scoreChartColumn,
                    {
                      width: barWidth,
                      marginRight: index === series.length - 1 ? 0 : columnGap,
                    },
                  ]}
                >
                  <View style={styles.scoreChartTopZone}>
                    {point.score > 0 ? (
                      <View
                        style={[
                          styles.scoreChartBar,
                          styles.scoreChartBarPositive,
                          {
                            height: barHeight,
                            backgroundColor: barColor,
                            borderColor: `${barColor}3A`,
                          },
                        ]}
                      />
                    ) : null}
                  </View>

                  <View style={styles.scoreChartCenterZone}>
                    {hasActivity ? (
                      <View
                        style={[
                          point.score === 0
                            ? styles.scoreChartZeroBar
                            : styles.scoreChartActivityDot,
                          {
                            backgroundColor:
                              point.score === 0 ? palette.textMuted : `${barColor}44`,
                          },
                        ]}
                      />
                    ) : (
                      <View style={styles.scoreChartIdleDot} />
                    )}
                  </View>

                  <View style={styles.scoreChartBottomZone}>
                    {point.score < 0 ? (
                      <View
                        style={[
                          styles.scoreChartBar,
                          styles.scoreChartBarNegative,
                          {
                            height: barHeight,
                            backgroundColor: barColor,
                            borderColor: `${barColor}3A`,
                          },
                        ]}
                      />
                    ) : null}
                  </View>

                  <Text
                    numberOfLines={1}
                    style={[
                      styles.scoreChartAxisLabel,
                      !point.showAxisLabel && styles.scoreChartAxisLabelHidden,
                    ]}
                  >
                    {point.showAxisLabel ? point.axisLabel : ' '}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {hasEntries ? (
        <View style={styles.scoreChartInsightRow}>
          {highestPoint ? (
            <View
              style={[
                styles.scoreChartInsightChip,
                {
                  backgroundColor: `${highestColor}14`,
                  borderColor: `${highestColor}24`,
                },
              ]}
            >
              <Text style={styles.scoreChartInsightLabel}>최고</Text>
              <Text style={[styles.scoreChartInsightValue, { color: highestColor }]}>
                {`${formatScore(highestPoint.score)} · ${highestPoint.label}`}
              </Text>
            </View>
          ) : null}
          {lowestPoint ? (
            <View
              style={[
                styles.scoreChartInsightChip,
                {
                  backgroundColor: `${lowestColor}14`,
                  borderColor: `${lowestColor}24`,
                },
              ]}
            >
              <Text style={styles.scoreChartInsightLabel}>최저</Text>
              <Text style={[styles.scoreChartInsightValue, { color: lowestColor }]}>
                {`${formatScore(lowestPoint.score)} · ${lowestPoint.label}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.emptyText}>이 기간에는 아직 기록이 없어서 그래프가 비어 있어요.</Text>
      )}
    </View>
  );
}

function StatsDetailModal({
  cards,
  onClose,
  onSelectPeriod,
  progress,
  selectedCard,
  series,
  visible,
}: {
  cards: StatsCardData[];
  onClose: () => void;
  onSelectPeriod: (period: ScoreSeriesPeriod) => void;
  progress: Animated.Value;
  selectedCard: StatsCardData | null;
  series: ScoreSeriesPoint[];
  visible: boolean;
}) {
  const { isDark, palette, styles } = useAppTheme();

  if (!selectedCard) {
    return null;
  }

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const cardOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });
  const cardTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [34, 0],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });
  const glowScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });
  const heroColors = getStatsHeroColors(selectedCard.summary.score, isDark);
  const detailIconColor =
    selectedCard.summary.total > 0 ? selectedCard.accentColor : palette.text;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.statsModalOverlay}>
        <Animated.View
          pointerEvents="none"
          style={[styles.statsModalScrim, { opacity: backdropOpacity }]}
        />
        <Pressable onPress={onClose} style={styles.modalBackdrop} />

        <Animated.View
          style={[
            styles.statsModalGlow,
            {
              opacity: backdropOpacity,
              backgroundColor: `${selectedCard.accentColor}18`,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.statsModalWindow,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            },
          ]}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.statsModalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={heroColors}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.statsModalHero}
            >
              <View style={styles.statsModalHeroHeader}>
                <View style={styles.statsModalHeroBadge}>
                  <MaterialCommunityIcons
                    color={detailIconColor}
                    name={selectedCard.icon}
                    size={16}
                  />
                  <Text style={styles.statsModalHeroBadgeText}>Score Flow</Text>
                </View>
                <Pressable onPress={onClose} style={styles.statsModalClose}>
                  <MaterialCommunityIcons color={palette.textMuted} name="close" size={20} />
                </Pressable>
              </View>

              <Text style={styles.statsModalTitle}>{selectedCard.title} 통계</Text>
              <Text style={styles.statsModalPeriod}>{selectedCard.period}</Text>

              <View style={styles.statsModalHeroMetrics}>
                <View
                  style={[
                    styles.statsModalScorePlate,
                    {
                      backgroundColor: getTrendSoft(selectedCard.summary.score, palette),
                      borderColor: `${detailIconColor}20`,
                    },
                  ]}
                >
                  <Text style={styles.statsModalScoreLabel}>점수</Text>
                  <Text style={[styles.statsModalScoreValue, { color: detailIconColor }]}>
                    {formatScore(selectedCard.summary.score)}
                  </Text>
                </View>

                <View style={styles.statsModalHeroStats}>
                  <MetricPill
                    accentColor={palette.rise}
                    backgroundColor={palette.riseSoft}
                    icon="thumb-up-outline"
                    label="엄지 척!!"
                    value={selectedCard.summary.upCount}
                  />
                  <MetricPill
                    accentColor={palette.fall}
                    backgroundColor={palette.fallSoft}
                    icon="thumb-down-outline"
                    label="이건 좀.."
                    value={selectedCard.summary.downCount}
                  />
                </View>
              </View>
            </LinearGradient>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsModalTabRow}
            >
              {cards.map((card) => {
                const isActive = card.key === selectedCard.key;

                return (
                  <Pressable
                    key={card.key}
                    onPress={() => onSelectPeriod(card.key)}
                    style={({ pressed }) => [
                      styles.statsModalTab,
                      {
                        borderColor: isActive ? `${card.accentColor}42` : palette.border,
                        backgroundColor: isActive
                          ? `${card.accentColor}14`
                          : isDark
                            ? 'rgba(18,25,24,0.9)'
                            : 'rgba(255,255,255,0.8)',
                      },
                      pressed && styles.statsModalTabPressed,
                    ]}
                  >
                    <MaterialCommunityIcons
                      color={isActive ? card.accentColor : palette.textMuted}
                      name={card.icon}
                      size={15}
                    />
                    <Text
                      style={[
                        styles.statsModalTabText,
                        { color: isActive ? card.accentColor : palette.textMuted },
                      ]}
                    >
                      {card.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScoreChartCard
              accentColor={selectedCard.accentColor}
              period={selectedCard.period}
              series={series}
              summary={selectedCard.summary}
              title={`${selectedCard.title} 점수 흐름`}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
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
  const { palette, styles } = useAppTheme();

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
          icon="thumb-up-outline"
          label="엄지 척!!"
          record={records.upRecord}
        />
        <BestRecordRow
          accentColor={palette.fall}
          icon="thumb-down-outline"
          label="이건 좀.."
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
  const { palette, styles } = useAppTheme();

  return (
    <View
      style={[
        styles.recordRow,
        {
          backgroundColor: record ? `${accentColor}0F` : palette.panel,
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
  const { isDark, palette, styles } = useAppTheme();
  const isRise = action.kind === 'up';
  const accentColor = isRise ? palette.rise : palette.fall;
  const colors = isRise
    ? isDark
      ? (['#18302D', '#244541'] as const)
      : (['#FFE8EC', '#FFC3CC'] as const)
    : isDark
      ? (['#182430', '#23384C'] as const)
      : (['#EAF2FF', '#C7DDFF'] as const);
  const addedCount = action.entries.length;
  const title = isRise
    ? `엄지 척!! ${addedCount}건 추가됨`
    : `이건 좀.. ${addedCount}건 추가됨`;
  const subtitle =
    addedCount > 1
      ? '롱프레스 묶음 입력을 되돌릴 수 있어요.'
      : action.note || (isRise ? '칭찬 기록이 저장됐어요.' : '주의 기록이 저장됐어요.');
  const icon = isRise ? 'thumb-up-outline' : 'thumb-down-outline';

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
  tabPosition,
}: {
  activeTab: TabKey;
  bottomInset: number;
  onChange: (tab: TabKey) => void;
  tabPosition: Animated.Value;
}) {
  const { palette, styles } = useAppTheme();
  const [barWidth, setBarWidth] = useState(0);
  const horizontalPadding = 10;
  const gap = 10;
  const tabWidth =
    barWidth > 0 ? (barWidth - horizontalPadding * 2 - gap * 2) / 3 : 0;

  const indicatorTranslateX = tabPosition.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      horizontalPadding,
      horizontalPadding + tabWidth + gap,
      horizontalPadding + (tabWidth + gap) * 2,
    ],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.tabBarWrap, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={styles.tabBar}
      >
        {tabWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabIndicator,
              {
                width: tabWidth,
                transform: [{ translateX: indicatorTranslateX }],
              },
            ]}
          />
        ) : null}
        <TabBarButton
          accentColor={palette.brand}
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
          icon="chart-timeline-variant-shimmer"
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
  const { palette, styles } = useAppTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.infoModalCard}>
          <View style={styles.dayModalHeader}>
            <View>
              <Text style={styles.dayModalTitle}>All We Experience</Text>
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
              text="달력 탭에서 월별 이동과 날짜별 초기화가 가능해요."
            />
            <InfoRow
              icon="chart-timeline-variant-shimmer"
              text="통계 탭에서 주간, 월간, 분기, 연간 흐름과 최고 기록을 봅니다."
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
  const { palette, styles } = useAppTheme();

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
  const { palette, styles } = useAppTheme();
  const textColor = active ? palette.text : palette.textMuted;
  const resolvedTextColor = active ? '#0E1C19' : textColor;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        pressed && styles.tabButtonPressed,
      ]}
    >
      <View style={styles.tabButtonInner}>
        <MaterialCommunityIcons color={resolvedTextColor} name={icon} size={20} />
        <Text style={[styles.tabButtonLabel, { color: resolvedTextColor }]}>{label}</Text>
      </View>
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
  const { palette, styles } = useAppTheme();

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
                {
                  backgroundColor: summary
                    ? getTrendSoft(summary.score, palette)
                    : palette.panel,
                },
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
                icon="thumb-up-outline"
                label="엄지 척!!"
                value={summary?.upCount ?? 0}
              />
              <MetricPill
                accentColor={palette.fall}
                backgroundColor={palette.fallSoft}
                icon="thumb-down-outline"
                label="이건 좀.."
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
                            ? 'thumb-up-outline'
                            : 'thumb-down-outline'
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
  entry: RecentRecordGroup;
  onDelete: (entry: RecentRecordGroup) => void;
}) {
  const { isDark, palette, styles } = useAppTheme();
  const accentColor = getEntryAccent(entry.kind, palette);
  const backgroundColor = getEntrySoft(entry.kind, palette);
  const deleteTint = isDark ? '#F39AA4' : '#D26A76';
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
          name={entry.kind === 'up' ? 'thumb-up-outline' : 'thumb-down-outline'}
          size={18}
        />
        {entry.points > 1 ? (
          <View style={[styles.entryPointBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.entryPointBadgeText}>{entry.points}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.entryCopy}>
        <Text style={styles.entryTitle}>{title}</Text>
        <Text style={styles.entryMeta}>{formatEntryTimestamp(entry.createdAt)}</Text>
      </View>

      <Pressable
        hitSlop={10}
        onPress={() => onDelete(entry)}
        style={({ pressed }) => [
          styles.deleteButton,
          { backgroundColor: `${deleteTint}18` },
          pressed && styles.deletePressed,
        ]}
      >
        <MaterialCommunityIcons color={deleteTint} name="trash-can-outline" size={18} />
      </Pressable>
    </View>
  );
}

function getTrendColor(score: number, palette: Palette): string {
  if (score > 0) {
    return palette.rise;
  }

  if (score < 0) {
    return palette.fall;
  }

  return palette.text;
}

function getTrendSoft(score: number, palette: Palette): string {
  if (score > 0) {
    return palette.riseSoft;
  }

  if (score < 0) {
    return palette.fallSoft;
  }

  return palette.panelStrong;
}

function getTrendSurface(score: number, palette: Palette): string {
  if (score > 0) {
    return palette === darkPalette
      ? 'rgba(103, 216, 204, 0.14)'
      : 'rgba(103, 216, 204, 0.08)';
  }

  if (score < 0) {
    return palette === darkPalette
      ? 'rgba(127, 178, 226, 0.15)'
      : 'rgba(127, 178, 226, 0.09)';
  }

  return palette.panel;
}

function getStatsHeroColors(
  score: number,
  isDark: boolean
): readonly [string, string, string] {
  if (score > 0) {
    return isDark
      ? ['#173531', '#101D1A', '#0E1413']
      : ['#DFFBF5', '#F7FFFD', '#FFFFFF'];
  }

  if (score < 0) {
    return isDark
      ? ['#152537', '#101820', '#0E1318']
      : ['#E8F3FE', '#F9FCFF', '#FFFFFF'];
  }

  return isDark
    ? ['#1A2422', '#121817', '#101413']
    : ['#EEF4F2', '#FAFDFC', '#FFFFFF'];
}

function getEntryAccent(kind: VoteKind, palette: Palette): string {
  return kind === 'up' ? palette.rise : palette.fall;
}

function getEntrySoft(kind: VoteKind, palette: Palette): string {
  return kind === 'up' ? palette.riseSoft : palette.fallSoft;
}

function formatCompactWeekRange(referenceDate: Date): string {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}.${start.getDate()}-${end.getMonth() + 1}.${end.getDate()}`;
}

function formatCompactMonthRange(referenceDate: Date): string {
  return `${referenceDate.getFullYear()}.${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
}

function formatCompactQuarterRange(referenceDate: Date): string {
  return `${referenceDate.getFullYear()} Q${Math.floor(referenceDate.getMonth() / 3) + 1}`;
}

function formatCompactYearRange(referenceDate: Date): string {
  return `${referenceDate.getFullYear()}`;
}

function getRecentRecordGroups(entries: VoteEntry[]): RecentRecordGroup[] {
  const groups: RecentRecordGroup[] = [];

  for (const entry of sortEntries(entries)) {
    const lastGroup = groups[groups.length - 1];

    if (entry.batchId && lastGroup && lastGroup.key === entry.batchId) {
      lastGroup.ids.push(entry.id);
      lastGroup.points += 1;
      continue;
    }

    groups.push({
      key: entry.batchId ?? entry.id,
      ids: [entry.id],
      kind: entry.kind,
      note: entry.note,
      createdAt: entry.createdAt,
      points: 1,
    });
  }

  return groups;
}

function createStyles(palette: Palette) {
  const isDark = palette === darkPalette;

  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  contentShell: {
    flex: 1,
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
  pager: {
    flex: 1,
  },
  pagerPage: {
    flex: 1,
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
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(22,29,27,0.92)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: palette.border,
  },
  brandIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(24,32,30,0.96)' : 'rgba(255,255,255,0.82)',
  },
  brandText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
  },
  brandLetterText: {
    color: '#34CDBF',
    fontWeight: '800',
  },
  brandRestText: {
    color: palette.text,
    fontWeight: '700',
  },
  brandInfoButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(24,32,30,0.94)' : 'rgba(255,255,255,0.78)',
  },
  brandInfoPressed: {
    opacity: 0.7,
  },
  heroCard: {
    borderRadius: 32,
    padding: 22,
    gap: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(255,255,255,0.6)',
    shadowColor: isDark ? '#000000' : '#7B8BB0',
    shadowOpacity: isDark ? 0.28 : 0.12,
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
    backgroundColor: isDark ? 'rgba(35,52,49,0.96)' : 'rgba(255,255,255,0.72)',
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
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.05)' : 'transparent',
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
    backgroundColor: isDark ? 'rgba(10,15,14,0.98)' : 'rgba(255,255,255,0.76)',
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
    minHeight: 150,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 28,
    justifyContent: 'center',
    gap: 18,
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
    backgroundColor: isDark ? 'rgba(10,15,14,0.88)' : 'rgba(255,255,255,0.72)',
  },
  actionButtonLabel: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
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
    backgroundColor: isDark ? 'rgba(21,29,27,0.92)' : 'rgba(255,255,255,0.7)',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
    columnGap: 10,
    justifyContent: 'space-between',
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
  calendarCardWide: {
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 18,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  calendarTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
  },
  calendarSubtitle: {
    marginTop: 3,
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(25,33,31,0.94)' : 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(82, 92, 122, 0.08)',
  },
  calendarNavPressed: {
    opacity: 0.72,
  },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarWeekday: {
    width: '13.85%',
    textAlign: 'center',
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  calendarCell: {
    width: '13.85%',
    height: 78,
    borderRadius: 18,
    paddingTop: 9,
    paddingBottom: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  calendarCellPressed: {
    opacity: 0.82,
  },
  calendarEmptyCell: {
    width: '13.85%',
    height: 78,
  },
  calendarDayNumber: {
    fontFamily: fonts.display,
    width: '100%',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  calendarDayScore: {
    fontFamily: fonts.display,
    width: '100%',
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: -0.2,
    fontWeight: '800',
  },
  statCard: {
    width: '48%',
    minHeight: 156,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
  },
  statCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }, { translateY: 2 }],
  },
  statCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCardTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
  },
  statCardPeriodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(24,32,30,0.94)' : 'rgba(255,255,255,0.74)',
  },
  statCardPeriod: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  statCardScore: {
    fontFamily: fonts.display,
    fontSize: 31,
    fontWeight: '800',
  },
  statCardDetails: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statDetail: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(25,33,31,0.94)' : 'rgba(255,255,255,0.78)',
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  scoreChartCard: {
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    gap: 16,
  },
  scoreChartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  scoreChartCopy: {
    flex: 1,
    gap: 4,
  },
  scoreChartTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
  },
  scoreChartSubtitle: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  scoreChartScoreBadge: {
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  scoreChartScoreLabel: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  scoreChartScoreValue: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
  },
  scoreChartFrame: {
    marginHorizontal: -4,
  },
  scoreChartScroll: {
    flexGrow: 0,
  },
  scoreChartPlot: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 150,
    paddingTop: 4,
  },
  scoreChartBaseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 60,
    height: 1,
  },
  scoreChartColumn: {
    alignItems: 'center',
  },
  scoreChartTopZone: {
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  scoreChartCenterZone: {
    height: 8,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChartBottomZone: {
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  scoreChartBar: {
    width: '100%',
    borderWidth: 1,
  },
  scoreChartBarPositive: {
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  scoreChartBarNegative: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
  },
  scoreChartActivityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scoreChartZeroBar: {
    width: '100%',
    height: 4,
    borderRadius: 999,
  },
  scoreChartIdleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(223, 248, 244, 0.08)' : 'rgba(12, 18, 16, 0.08)',
  },
  scoreChartAxisLabel: {
    marginTop: 10,
    width: '100%',
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreChartAxisLabelHidden: {
    color: 'transparent',
  },
  scoreChartInsightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreChartInsightChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  scoreChartInsightLabel: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  scoreChartInsightValue: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  statsModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  statsModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 14, 20, 0.44)',
  },
  statsModalGlow: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  statsModalWindow: {
    maxHeight: '92%',
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: isDark ? '#0F1615' : '#F7FBFA',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(12,18,16,0.08)',
    shadowColor: '#3E4B60',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 18,
    },
    elevation: 18,
  },
  statsModalScrollContent: {
    padding: 14,
    gap: 14,
  },
  statsModalHero: {
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 12,
  },
  statsModalHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsModalHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(11,17,16,0.32)' : 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(12,18,16,0.06)',
  },
  statsModalHeroBadgeText: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statsModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(11,17,16,0.38)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(12,18,16,0.06)',
  },
  statsModalTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '800',
  },
  statsModalPeriod: {
    marginTop: -2,
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  statsModalHeroMetrics: {
    gap: 12,
  },
  statsModalScorePlate: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 4,
    alignSelf: 'flex-start',
    minWidth: 110,
  },
  statsModalScoreLabel: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  statsModalScoreValue: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '800',
  },
  statsModalHeroStats: {
    gap: 10,
  },
  statsModalTabRow: {
    gap: 8,
    paddingHorizontal: 2,
  },
  statsModalTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  statsModalTabPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  statsModalTabText: {
    fontFamily: fonts.body,
    fontSize: 12,
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
    backgroundColor: isDark ? 'rgba(24,32,30,0.94)' : 'rgba(255,255,255,0.74)',
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
    backgroundColor: isDark ? 'rgba(21,29,27,0.94)' : 'rgba(255,255,255,0.72)',
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
    backgroundColor: isDark ? 'rgba(21,29,27,0.94)' : 'rgba(255,255,255,0.68)',
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
  entryPointBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  entryPointBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
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
    backgroundColor: isDark ? '#121918' : '#FFFDFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(255,255,255,0.72)',
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
    backgroundColor: isDark ? 'rgba(24,32,30,0.94)' : 'rgba(255,255,255,0.82)',
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
    backgroundColor: isDark ? '#121918' : '#FFFDFC',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(255,255,255,0.72)',
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
    backgroundColor: isDark ? 'rgba(21,29,27,0.94)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(82, 92, 122, 0.08)',
  },
  infoRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(28,36,34,0.98)' : 'rgba(255,255,255,0.9)',
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
    backgroundColor: isDark ? 'rgba(21,29,27,0.94)' : 'rgba(255,255,255,0.72)',
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
    backgroundColor: isDark ? 'rgba(24,32,30,0.96)' : 'rgba(255,255,255,0.84)',
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
    paddingTop: 8,
    borderRadius: 28,
    backgroundColor: isDark ? 'rgba(14,20,19,0.94)' : 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(223,248,244,0.08)' : 'rgba(255,255,255,0.75)',
    shadowColor: '#6B7892',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 14,
  },
  tabIndicator: {
    position: 'absolute',
    top: 8,
    bottom: 0,
    height: 44,
    borderRadius: 20,
    backgroundColor: isDark ? '#A9F2E8' : '#D7FAF4',
    shadowColor: isDark ? '#67D8CC' : '#8CD8D0',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tabButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    transform: [{ translateY: -2 }],
  },
  tabButtonPressed: {
    opacity: 0.78,
  },
  tabButtonLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 11,
    fontWeight: '700',
  },
  });
}
