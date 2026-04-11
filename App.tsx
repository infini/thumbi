import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type BestPeriodRecord,
  createVoteEntry,
  formatEntryTimestamp,
  formatMonthRange,
  formatQuarterRange,
  formatScore,
  formatWeekRange,
  getBestPeriodRecords,
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

export default function App() {
  const [entries, setEntries] = useState<VoteEntry[]>([]);
  const [draftNote, setDraftNote] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingUndoEntry, setPendingUndoEntry] = useState<VoteEntry | null>(null);

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
    if (!pendingUndoEntry) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPendingUndoEntry(null);
    }, UNDO_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingUndoEntry]);

  const now = new Date();
  const todaySummary = getTodaySummary(entries, now);
  const weekSummary = getWeekSummary(entries, now);
  const monthSummary = getMonthSummary(entries, now);
  const quarterSummary = getQuarterSummary(entries, now);
  const monthBestRecords = getBestPeriodRecords(entries, 'month');
  const quarterBestRecords = getBestPeriodRecords(entries, 'quarter');
  const yearBestRecords = getBestPeriodRecords(entries, 'year');
  const recentEntries = entries.slice(0, 6);
  const todayScoreColor = getTrendColor(todaySummary.score);

  function handleAddEntry(kind: VoteKind) {
    const nextEntry = createVoteEntry(kind, draftNote.trim());
    setEntries((currentEntries) => [nextEntry, ...currentEntries]);
    setPendingUndoEntry(nextEntry);
    setDraftNote('');
  }

  function handleUndoAdd() {
    if (!pendingUndoEntry) {
      return;
    }

    setEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.id !== pendingUndoEntry.id)
    );
    setPendingUndoEntry(null);
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        <View style={[styles.orb, styles.orbRise]} />
        <View style={[styles.orb, styles.orbFall]} />
        <View style={[styles.orb, styles.orbSun]} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
          </View>
          <Text style={styles.storageHint}>
            {isHydrated ? '이 기기 안에만 저장' : '기록 불러오는 중'}
          </Text>
        </View>

        <LinearGradient
          colors={['#FFF1F4', '#FFFFFF', '#EEF4FF']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.heroCard}
        >
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>daily balance</Text>
              <Text style={styles.heroTitle}>잘한 일과 아쉬운 일을 한 번에 기록</Text>
              <Text style={styles.heroDescription}>
                칭찬과 주의 기록을 쌓아두고, 이번 주와 이번 달의 흐름을 바로 확인할 수
                있어요.
              </Text>
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
              label="엄지 업"
              onPress={() => handleAddEntry('up')}
              subtitle="빨간 상승으로 기록"
              iconColor={palette.rise}
              labelColor="#8F223B"
              subtitleColor="#B54E64"
            />
            <ActionButton
              colors={['#DDEBFF', '#8EBEFF']}
              icon="arrow-bottom-left-thick"
              label="엄지 다운"
              onPress={() => handleAddEntry('down')}
              subtitle="파란 하락으로 기록"
              iconColor={palette.fall}
              labelColor="#1F4F89"
              subtitleColor="#517AB2"
            />
          </View>
        </LinearGradient>

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
            <Text style={styles.sectionChipText}>자동 집계</Text>
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
            <Text style={styles.sectionChipText}>역대 최고</Text>
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
          <BestRecordCard icon="calendar" records={yearBestRecords} title="연간 최고" />
        </View>

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
      </ScrollView>
      {pendingUndoEntry ? (
        <UndoSnackbar entry={pendingUndoEntry} onUndo={handleUndoAdd} />
      ) : null}
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
  label,
  onPress,
  subtitle,
  iconColor,
  labelColor,
  subtitleColor,
}: {
  colors: readonly [string, string];
  icon: IconName;
  label: string;
  onPress: () => void;
  subtitle: string;
  iconColor: string;
  labelColor: string;
  subtitleColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
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
  entry,
  onUndo,
}: {
  entry: VoteEntry;
  onUndo: () => void;
}) {
  const isRise = entry.kind === 'up';
  const accentColor = isRise ? palette.rise : palette.fall;
  const colors = isRise
    ? (['#FFE8EC', '#FFC3CC'] as const)
    : (['#EAF2FF', '#C7DDFF'] as const);
  const title = isRise ? '상승 기록이 추가됐어요' : '하락 기록이 추가됐어요';
  const subtitle = entry.note || (isRise ? '칭찬 기록이 저장됐어요.' : '주의 기록이 저장됐어요.');
  const icon = isRise ? 'arrow-top-right-thick' : 'arrow-bottom-left-thick';

  return (
    <View pointerEvents="box-none" style={styles.undoWrap}>
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
    paddingTop: 16,
    paddingBottom: 120,
    gap: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  storageHint: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
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
  eyebrow: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  heroDescription: {
    color: palette.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
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
  undoWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 18,
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
});
