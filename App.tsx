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
  createVoteEntry,
  formatEntryTimestamp,
  formatMonthRange,
  formatScore,
  formatWeekRange,
  getMonthSummary,
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

export default function App() {
  const [entries, setEntries] = useState<VoteEntry[]>([]);
  const [draftNote, setDraftNote] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);

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

  const now = new Date();
  const todaySummary = getTodaySummary(entries, now);
  const weekSummary = getWeekSummary(entries, now);
  const monthSummary = getMonthSummary(entries, now);
  const recentEntries = entries.slice(0, 6);

  function handleAddEntry(kind: VoteKind) {
    const nextEntry = createVoteEntry(kind, draftNote.trim());
    setEntries((currentEntries) => [nextEntry, ...currentEntries]);
    setDraftNote('');
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
        <View style={[styles.orb, styles.orbPeach]} />
        <View style={[styles.orb, styles.orbMint]} />
        <View style={[styles.orb, styles.orbSky]} />
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
                color={palette.text}
                name="thumb-up-outline"
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
          colors={['#FFF5E9', '#F6FBF7', '#EEF4FF']}
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
            <View style={styles.scoreBubble}>
              <Text style={styles.scoreLabel}>오늘 점수</Text>
              <Text style={styles.scoreValue}>{formatScore(todaySummary.score)}</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <MetricPill
              accentColor={palette.positive}
              backgroundColor={palette.positiveSoft}
              icon="thumb-up"
              label="엄지 업"
              value={todaySummary.upCount}
            />
            <MetricPill
              accentColor={palette.negative}
              backgroundColor={palette.negativeSoft}
              icon="thumb-down"
              label="엄지 다운"
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
              colors={['#C9F6D7', '#84DDA3']}
              icon="thumb-up"
              label="엄지 업"
              onPress={() => handleAddEntry('up')}
              subtitle="칭찬 기록하기"
              textColor={palette.text}
            />
            <ActionButton
              colors={['#FFD9CF', '#F2A38D']}
              icon="thumb-down"
              label="엄지 다운"
              onPress={() => handleAddEntry('down')}
              subtitle="주의 기록하기"
              textColor={palette.text}
            />
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>통계 요약</Text>
            <Text style={styles.sectionDescription}>
              주간 흐름과 월간 누적 점수를 같이 봅니다.
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
            accentColor={palette.positive}
            icon="calendar-week"
            period={formatWeekRange(now)}
            summary={weekSummary}
            title="이번 주"
          />
          <StatCard
            accentColor={palette.gold}
            icon="calendar-month"
            period={formatMonthRange(now)}
            summary={monthSummary}
            title="이번 달"
          />
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
                  color={palette.textMuted}
                  name="star-four-points-outline"
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
        <Text style={styles.metricPillValue}>{value}</Text>
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
  textColor,
}: {
  colors: readonly [string, string];
  icon: IconName;
  label: string;
  onPress: () => void;
  subtitle: string;
  textColor: string;
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
          <MaterialCommunityIcons color={textColor} name={icon} size={26} />
        </View>
        <Text style={styles.actionButtonLabel}>{label}</Text>
        <Text style={styles.actionButtonSubtitle}>{subtitle}</Text>
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
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statCardIcon, { backgroundColor: `${accentColor}18` }]}>
          <MaterialCommunityIcons color={accentColor} name={icon} size={20} />
        </View>
        <View>
          <Text style={styles.statCardTitle}>{title}</Text>
          <Text style={styles.statCardPeriod}>{period}</Text>
        </View>
      </View>

      <Text style={styles.statCardScore}>{formatScore(summary.score)}</Text>

      <View style={styles.statCardDetails}>
        <Text style={styles.statDetail}>업 {summary.upCount}</Text>
        <Text style={styles.statDetail}>다운 {summary.downCount}</Text>
        <Text style={styles.statDetail}>총 {summary.total}</Text>
      </View>
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
  const accentColor = entry.kind === 'up' ? palette.positive : palette.negative;
  const backgroundColor =
    entry.kind === 'up' ? palette.positiveSoft : palette.negativeSoft;
  const title = entry.note || (entry.kind === 'up' ? '칭찬 기록' : '주의 기록');

  return (
    <View style={styles.entryRow}>
      <View style={[styles.entryIcon, { backgroundColor }]}>
        <MaterialCommunityIcons
          color={accentColor}
          name={entry.kind === 'up' ? 'thumb-up' : 'thumb-down'}
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
  orbPeach: {
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    backgroundColor: palette.peach,
  },
  orbMint: {
    top: 280,
    left: -70,
    width: 180,
    height: 180,
    backgroundColor: palette.mint,
  },
  orbSky: {
    right: -30,
    bottom: 100,
    width: 190,
    height: 190,
    backgroundColor: palette.sky,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
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
    shadowColor: '#B86B38',
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
    color: palette.text,
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
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  actionButtonLabel: {
    marginTop: 18,
    color: palette.text,
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '700',
  },
  actionButtonSubtitle: {
    color: palette.textMuted,
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
  statCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
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
    color: palette.text,
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
});
