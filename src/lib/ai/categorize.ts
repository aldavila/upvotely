import { db } from '@/lib/db';

const CATEGORIES = ['bug', 'feature', 'ux', 'performance', 'integration', 'docs', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

interface CategorizationResult {
  category: Category;
  tags: string[];
}

/**
 * Classify a post into a category and extract relevant tags using OpenAI.
 * Falls back to 'other' with empty tags on any failure.
 */
export async function categorizePost(
  title: string,
  content: string
): Promise<CategorizationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { category: 'other', tags: [] };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You classify product feedback into categories. Respond with JSON: {"category": string, "tags": string[]}

Categories (pick exactly one):
- bug: Something is broken or not working correctly
- feature: A new capability or feature request
- ux: User experience or usability improvement
- performance: Speed, latency, or resource usage concerns
- integration: Third-party integrations, APIs, or connectivity
- docs: Documentation, guides, or help content
- other: Doesn't fit any above category

Tags: Extract 1-5 short descriptive tags (lowercase, no spaces — use hyphens). Tags should capture the specific topic.`,
          },
          {
            role: 'user',
            content: `Title: ${title}\n\nDescription: ${content}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return { category: 'other', tags: [] };
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t: unknown) => typeof t === 'string').slice(0, 5)
      : [];

    return { category, tags };
  } catch {
    return { category: 'other', tags: [] };
  }
}

/**
 * Run categorization on a post and update it in the database.
 * Designed to be called fire-and-forget after post creation.
 */
export async function categorizeAndUpdatePost(postId: string, title: string, content: string) {
  try {
    const result = await categorizePost(title, content);
    await db.post.update({
      where: { id: postId },
      data: {
        aiCategory: result.category,
        aiTags: result.tags,
      },
    });
  } catch {
    // Silently fail — AI categorization is best-effort
  }
}
