import { db } from '@/lib/db';

type Sentiment = 'positive' | 'neutral' | 'negative';

interface SentimentResult {
  sentiment: Sentiment;
  score: number;
}

/**
 * Analyze sentiment of a post using OpenAI.
 * Falls back to neutral with 0.5 score on any failure.
 */
export async function analyzeSentiment(
  title: string,
  content: string
): Promise<SentimentResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { sentiment: 'neutral', score: 0.5 };
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
            content: `Analyze the sentiment of product feedback. Respond with JSON: {"sentiment": string, "score": number}

sentiment: "positive" (praise, satisfaction, excitement), "neutral" (factual request, no strong emotion), or "negative" (frustration, complaint, disappointment)
score: confidence from 0.0 to 1.0 (how strongly the sentiment is expressed)`,
          },
          {
            role: 'user',
            content: `Title: ${title}\n\nDescription: ${content}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return { sentiment: 'neutral', score: 0.5 };
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    const validSentiments: Sentiment[] = ['positive', 'neutral', 'negative'];
    const sentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : 0.5;

    return { sentiment, score };
  } catch {
    return { sentiment: 'neutral', score: 0.5 };
  }
}

/**
 * Run sentiment analysis on a post and update it in the database.
 * Designed to be called fire-and-forget after post creation.
 */
export async function analyzeAndUpdateSentiment(postId: string, title: string, content: string) {
  try {
    const result = await analyzeSentiment(title, content);
    await db.post.update({
      where: { id: postId },
      data: {
        sentiment: result.sentiment,
        sentimentScore: result.score,
      },
    });
  } catch {
    // Silently fail — sentiment analysis is best-effort
  }
}
