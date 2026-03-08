import { db } from '@/lib/db';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'it', 'be', 'as', 'was', 'are', 'were', 'been', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'this', 'that', 'these', 'those', 'i', 'we', 'you', 'he', 'she', 'they', 'me', 'us',
  'my', 'our', 'your', 'his', 'her', 'its', 'their', 'not', 'no', 'so', 'if', 'when',
  'what', 'which', 'who', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about', 'above', 'after',
  'again', 'also', 'am', 'any', 'because', 'before', 'below', 'between', 'into', 'only',
  'own', 'same', 'then', 'there', 'up', 'out', 'over', 'under', 'want', 'need', 'like',
  'please', 'would', 'able', 'get', 'make', 'use',
]);

export interface SimilarPost {
  id: string;
  title: string;
  voteCount: number;
  status: { name: string; color: string; slug: string };
  similarityScore: number;
}

/**
 * Tokenize text into meaningful keywords.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Calculate keyword overlap similarity between two token sets.
 * Uses Jaccard similarity coefficient.
 */
function calculateSimilarity(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Find similar posts in the same board using keyword-based similarity.
 * Returns top matches sorted by similarity score.
 */
export async function findSimilarPosts(
  title: string,
  content: string,
  boardId: string,
  excludePostId?: string,
  limit: number = 5,
  minSimilarity: number = 0.2
): Promise<SimilarPost[]> {
  const inputTokens = tokenize(`${title} ${content}`);
  if (inputTokens.length === 0) return [];

  // Fetch candidate posts from the same board
  const candidates = await db.post.findMany({
    where: {
      boardId,
      isApproved: true,
      mergedIntoId: null,
      ...(excludePostId ? { id: { not: excludePostId } } : {}),
    },
    select: {
      id: true,
      title: true,
      content: true,
      voteCount: true,
      status: { select: { name: true, color: true, slug: true } },
    },
    take: 200, // Cap candidates for performance
    orderBy: { voteCount: 'desc' },
  });

  // Score each candidate
  const scored = candidates
    .map((post) => {
      const postTokens = tokenize(`${post.title} ${post.content}`);
      const similarityScore = calculateSimilarity(inputTokens, postTokens);
      return {
        id: post.id,
        title: post.title,
        voteCount: post.voteCount,
        status: post.status,
        similarityScore,
      };
    })
    .filter((p) => p.similarityScore >= minSimilarity)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);

  return scored;
}

/**
 * Create merge suggestions for highly similar posts.
 * Called after post creation with a higher similarity threshold.
 */
export async function createMergeSuggestions(
  postId: string,
  title: string,
  content: string,
  boardId: string
) {
  try {
    const similar = await findSimilarPosts(title, content, boardId, postId, 3, 0.5);

    for (const match of similar) {
      await db.mergeSuggestion.upsert({
        where: {
          sourcePostId_targetPostId: {
            sourcePostId: postId,
            targetPostId: match.id,
          },
        },
        create: {
          sourcePostId: postId,
          targetPostId: match.id,
          similarity: match.similarityScore,
        },
        update: {
          similarity: match.similarityScore,
        },
      });
    }
  } catch {
    // Silently fail — merge suggestions are best-effort
  }
}
