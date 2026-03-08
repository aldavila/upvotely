import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export interface AgentStat {
  agentId: string;
  agentName: string | null;
  positive: number;
  negative: number;
  total: number;
  satisfactionRate: number;
}

export interface NegativeTheme {
  tag: string;
  count: number;
}

export interface DailyTrendEntry {
  date: string;
  positive: number;
  negative: number;
  total: number;
  rate: number;
}

export interface FeedbackStatsResult {
  overview: {
    total: number;
    positive: number;
    negative: number;
    satisfactionRate: number;
  };
  agents: AgentStat[];
  negativeThemes: NegativeTheme[];
  dailyTrend: DailyTrendEntry[];
}

/**
 * Compute aggregated feedback stats for an organization over a given period.
 * Uses database-level groupBy to avoid loading all rows into memory.
 */
export async function computeFeedbackStats(
  orgId: string,
  days: number = 30
): Promise<FeedbackStatsResult> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const baseWhere: Prisma.ConversationFeedbackWhereInput = {
    organizationId: orgId,
    createdAt: { gte: since },
  };

  // --- Overview counts ---
  const [totalCount, positiveCount, negativeCount] = await Promise.all([
    db.conversationFeedback.count({ where: baseWhere }),
    db.conversationFeedback.count({ where: { ...baseWhere, rating: 'positive' } }),
    db.conversationFeedback.count({ where: { ...baseWhere, rating: 'negative' } }),
  ]);

  const satisfactionRate = totalCount > 0
    ? Math.round((positiveCount / totalCount) * 100)
    : 0;

  // --- Per-agent stats (database-level groupBy) ---
  const agentStats = await db.conversationFeedback.groupBy({
    by: ['agentId', 'agentName', 'rating'],
    where: baseWhere,
    _count: true,
  });

  const agentMap = new Map<string, {
    agentId: string;
    agentName: string | null;
    positive: number;
    negative: number;
    total: number;
  }>();

  for (const row of agentStats) {
    const key = row.agentId ?? 'unknown';
    const existing = agentMap.get(key) ?? {
      agentId: key,
      agentName: row.agentName,
      positive: 0,
      negative: 0,
      total: 0,
    };
    if (row.rating === 'positive') existing.positive += row._count;
    else existing.negative += row._count;
    existing.total += row._count;
    agentMap.set(key, existing);
  }

  const agents: AgentStat[] = Array.from(agentMap.values())
    .map((a) => ({
      ...a,
      satisfactionRate: a.total > 0 ? Math.round((a.positive / a.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // --- Negative themes: use groupBy on tags via raw query to avoid loading all rows ---
  // Prisma doesn't support groupBy on array fields, so we still need findMany
  // but we only select the tags column to minimise memory usage.
  const negativeFeedbackTags = await db.conversationFeedback.findMany({
    where: { ...baseWhere, rating: 'negative' },
    select: { tags: true },
  });

  const tagCounts = new Map<string, number>();
  for (const fb of negativeFeedbackTags) {
    for (const tag of fb.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const negativeThemes: NegativeTheme[] = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // --- Daily trend: use database-level groupBy instead of loading all rows ---
  const dailyPositive = await db.conversationFeedback.groupBy({
    by: ['createdAt'],
    where: { ...baseWhere, rating: 'positive' },
    _count: true,
  });

  const dailyNegative = await db.conversationFeedback.groupBy({
    by: ['createdAt'],
    where: { ...baseWhere, rating: 'negative' },
    _count: true,
  });

  // Prisma groupBy on DateTime returns exact timestamps, so we bucket by day
  const dailyMap = new Map<string, { positive: number; negative: number }>();

  for (const row of dailyPositive) {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    const existing = dailyMap.get(day) ?? { positive: 0, negative: 0 };
    existing.positive += row._count;
    dailyMap.set(day, existing);
  }

  for (const row of dailyNegative) {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    const existing = dailyMap.get(day) ?? { positive: 0, negative: 0 };
    existing.negative += row._count;
    dailyMap.set(day, existing);
  }

  const dailyTrend: DailyTrendEntry[] = Array.from(dailyMap.entries())
    .map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.positive + counts.negative,
      rate: counts.positive + counts.negative > 0
        ? Math.round((counts.positive / (counts.positive + counts.negative)) * 100)
        : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    overview: {
      total: totalCount,
      positive: positiveCount,
      negative: negativeCount,
      satisfactionRate,
    },
    agents,
    negativeThemes,
    dailyTrend,
  };
}
