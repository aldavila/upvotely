# Upvotely PRD — Three-Market Feedback Platform

**Version:** 1.0
**Date:** 2026-03-07
**Author:** Delta (CRO) + Alberto (Founder)
**Repo:** github.com/aldavila/upvotely

---

## Vision

Upvotely is the feedback platform that serves three distinct markets no single competitor covers:

1. **Dev Teams (Linear's market)** — Internal customer request management, prioritization, and dev workflow integration
2. **End Users (Canny's market)** — Public-facing voting boards, roadmaps, and changelogs
3. **AI Agents (greenfield)** — Programmatic feedback collection, MCP server, agent-native SDKs

The moat: one platform where internal product intelligence, public user voice, AND autonomous agent feedback all converge.

---

## Current State (What Exists)

### Built ✅
- Multi-tenant organizations with slug-based routing
- Feedback boards with posts, voting, comments (threaded)
- Status tracking (open, planned, in progress, complete, closed)
- Tags and categories
- Public changelog with linked posts
- Public roadmap view
- Embeddable widget (JS snippet, popup)
- Custom branding (colors, logo, "Powered by" toggle)
- Custom domain support (with verification)
- API keys with scopes and usage tracking
- Webhooks (post.created, vote.created, status.changed, etc.)
- NextAuth (email/password + OAuth)
- i18n (English + Spanish)
- Dashboard with stats, recent activity, quick actions
- Post merging (dedup)
- Anonymous posting
- Post moderation/approval flow
- 4-tier pricing (Free/Starter $29/Pro $79/Agency $199)

### Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Prisma ORM + PostgreSQL
- NextAuth v5
- TanStack Query
- shadcn/ui + Radix
- Tailwind CSS

---

## MARKET 1: Dev Teams (Linear Parity)

### Goal
Give product teams the internal tools to capture, organize, segment, and prioritize customer feedback tied to real customer data. This is the "back office" that Linear's Customer Requests provides.

### Features to Build

#### 1.1 Customer Profiles & Identity
**Priority: P0**
- **Customer model:** Company name, plan/tier, MRR/revenue, custom attributes (JSON), created date
- **Customer-User linking:** Map end users to customer accounts (many users per customer)
- **Identify API:** JavaScript SDK method `Upvotely.identify({ userId, email, name, company, plan, mrr, customFields })` that auto-creates/updates customer records
- **Customer directory:** Dashboard page listing all customers with their request count, total MRR, last activity
- **Customer detail view:** All feedback from a specific customer, their votes, their team's requests

```prisma
model Customer {
  id             String   @id @default(cuid())
  organizationId String
  externalId     String?  // Their ID in the org's system
  name           String
  email          String?
  company        String?
  plan           String?
  mrr            Float?   @default(0)
  customFields   Json?    @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(...)
  requests       CustomerRequest[]

  @@unique([organizationId, externalId])
  @@index([organizationId, mrr(sort: Desc)])
}

model CustomerRequest {
  id          String   @id @default(cuid())
  customerId  String
  postId      String
  source      String   @default("portal") // portal, api, widget, intercom, slack, agent
  note        String?  @db.Text
  priority    String?  // low, medium, high, critical
  createdAt   DateTime @default(now())

  customer    Customer @relation(...)
  post        Post     @relation(...)

  @@unique([customerId, postId])
}
```

#### 1.2 Revenue-Weighted Prioritization
**Priority: P0**
- **Prioritization score:** Auto-calculated score based on: vote count + total requesting MRR + customer tier weight + recency
- **Sort by revenue impact:** Dashboard view showing posts sorted by total MRR of requesting customers
- **Segment filters:** Filter feedback by customer plan, MRR range, company size
- **"X customers worth $Y/mo want this"** display on every post

#### 1.3 Internal Dashboard & Analytics
**Priority: P1**
- **Trends dashboard:** What's trending this week/month (new requests velocity, vote velocity)
- **Feedback volume over time:** Chart showing submission rate
- **Top requesters:** Which customers submit the most feedback
- **Status distribution:** Pie chart of feedback by status
- **Response time metrics:** Average time from submission to first team response
- **Board health:** Activity metrics per board

#### 1.4 Team Collaboration
**Priority: P1**
- **Internal comments:** Comments visible only to org members (already have `isInternal` field, need UI)
- **Assign posts to team members:** Add `assigneeId` to Post model
- **@mentions in comments:** Notify mentioned team members
- **Activity log:** Full audit trail of status changes, assignments, merges

#### 1.5 Integrations Hub
**Priority: P1**
- **Slack:** Post new feedback to a channel, create feedback from Slack messages
- **Linear:** Sync posts to Linear issues, bidirectional status updates
- **Jira:** Create Jira tickets from posts, sync status
- **GitHub:** Create GitHub issues from posts, link PRs, auto-complete when PR merges
- **Intercom:** Capture feedback from Intercom conversations, vote on behalf
- **Zendesk:** Same as Intercom
- **HubSpot/Salesforce:** Sync customer data, enrich customer profiles with CRM data

Integration architecture: Use a generic `Integration` model + per-provider adapters:

```prisma
model Integration {
  id             String   @id @default(cuid())
  organizationId String
  provider       String   // slack, linear, jira, github, intercom, etc.
  config         Json     // Provider-specific config (encrypted)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(...)
  syncLogs       IntegrationSync[]

  @@unique([organizationId, provider])
}
```

#### 1.6 AI-Powered Feedback Intelligence
**Priority: P1**
- **Auto-categorization:** AI classifies incoming feedback into categories (bug, feature, UX, performance, etc.)
- **Duplicate detection:** AI identifies similar/duplicate posts and suggests merges
- **Sentiment analysis:** Score each post positive/neutral/negative, track sentiment over time
- **Feedback summarization:** AI-generated weekly digest: "Your users' top 3 themes this week"
- **Smart grouping:** Cluster related requests even when worded differently
- **Keyword extraction:** Auto-tag posts with relevant keywords

#### 1.7 Notifications Engine
**Priority: P1**
- **Email notifications to voters:** When a post they voted on changes status
- **Email digest:** Weekly summary for admins (new posts, trending, completed)
- **In-app notifications:** Bell icon in dashboard with unread count
- **Slack/Discord notifications:** Configurable per event type
- **"Your feature shipped" emails:** Auto-notify all voters when status → complete

```prisma
model Notification {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  type           String   // status_change, new_comment, mention, digest
  title          String
  body           String   @db.Text
  postId         String?
  isRead         Boolean  @default(false)
  readAt         DateTime?
  createdAt      DateTime @default(now())

  user           User @relation(...)
}

model NotificationPreference {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  channel        String   // email, slack, in_app
  event          String   // all, status_change, new_post, mention
  enabled        Boolean  @default(true)

  user           User @relation(...)
  @@unique([userId, organizationId, channel, event])
}
```

---

## MARKET 2: End Users (Canny Parity + Better)

### Goal
The best public-facing feedback experience. Users visit, vote, discuss, and feel heard. This is what differentiates from Linear (which has no public portal).

### Features to Build

#### 2.1 Enhanced Public Portal
**Priority: P0**
- **Search with autocomplete:** As users type, suggest existing posts (reduces duplicates)
- **Category/board navigation:** Sidebar or tabs for browsing multiple boards
- **"Similar posts" on new submission:** Before submitting, show matches to encourage voting instead
- **Rich text editor:** Markdown preview, image uploads, code blocks
- **User profiles:** Public profile showing a user's submissions and votes

#### 2.2 SSO / Identify
**Priority: P0**
- **Canny-style Identify:** `Upvotely.identify({ appID, user: { id, name, email, avatarURL } })` — authenticates users seamlessly via JWT token. No separate signup needed.
- **SSO options:** Google, GitHub, OIDC/SAML for enterprise
- **Token-based board access:** Private boards accessible via signed JWT

#### 2.3 Enhanced Voting
**Priority: P1**
- **Vote on behalf:** Admins can add votes for customers who emailed/called
- **Vote with context:** Optional note when voting ("I need this because...")
- **Priority voting:** Users can mark one request as their #1 (weighted vote)

#### 2.4 Roadmap Enhancements
**Priority: P1**
- **Kanban roadmap view:** Drag columns for Now / Next / Later
- **Timeline/Gantt view:** Visual timeline with ETAs
- **Linked changelog:** When a roadmap item ships, auto-link to changelog entry
- **Subscribe to roadmap items:** Get notified when status changes

#### 2.5 Changelog Enhancements
**Priority: P2**
- **Email changelog to subscribers:** Opt-in email list for product updates
- **Changelog widget:** Embeddable "What's new" popup in their app
- **Changelog RSS feed:** For power users
- **Reaction emojis:** 🎉 🔥 ❤️ on changelog entries

#### 2.6 Surveys & NPS
**Priority: P2**
- **In-app NPS surveys:** "How likely are you to recommend?" triggered by events
- **CSAT after feature ships:** "How satisfied are you with this feature?"
- **Custom surveys:** Create short surveys, link responses to customer profiles
- **Net Promoter tracking:** NPS score over time chart

#### 2.7 Advanced Widget Types
**Priority: P1**
- **Sidebar widget:** Slides in from the side (not just popup)
- **Full-page embed:** iframe-able feedback portal
- **In-app contextual widget:** Attach to specific pages/features in their app
- **Screenshot capture:** Let users annotate screenshots with feedback
- **Session context:** Auto-capture current URL, browser, OS with each submission

---

## MARKET 3: AI Agents (New Market — No Competitor)

### Goal
Be the first feedback platform purpose-built for AI agent developers. When an agent needs to collect, analyze, or act on user feedback, Upvotely is the infrastructure.

### Features to Build

#### 3.1 MCP Server
**Priority: P0**
Expose Upvotely as an MCP (Model Context Protocol) server so any AI agent can interact with feedback boards natively.

**MCP Tools to expose:**
```
upvotely.list_boards         — List all boards for an org
upvotely.list_posts          — List/search/filter posts on a board
upvotely.get_post            — Get full post details with votes and comments
upvotely.create_post         — Submit new feedback programmatically
upvotely.vote                — Vote on a post
upvotely.add_comment         — Comment on a post
upvotely.update_status       — Change post status
upvotely.get_trends          — Get trending requests, top voted, recent
upvotely.search_similar      — Find posts similar to a description
upvotely.get_customer_voice  — Summarize what customers are asking for
upvotely.get_priorities      — Get AI-ranked priority list
```

**Implementation:** Standalone MCP server package (`@upvotely/mcp-server`) that connects via API key.

#### 3.2 Agent-Native REST API v2
**Priority: P0**
Enhanced API designed for programmatic/agent consumption (beyond the basic CRUD the current API supports).

**New endpoints:**
```
POST   /api/v2/feedback          — Submit feedback with full context
POST   /api/v2/feedback/batch    — Batch submit multiple items
GET    /api/v2/feedback/similar   — Find similar existing feedback
GET    /api/v2/feedback/trends    — Trending topics and themes
GET    /api/v2/feedback/summary   — AI-generated summary of all feedback
POST   /api/v2/conversations/:id/feedback — Per-conversation thumbs up/down
GET    /api/v2/insights           — Revenue-weighted priorities, segments
POST   /api/v2/events             — Log agent events (errors, user actions)
```

**Agent-specific fields on every submission:**
```json
{
  "title": "Agent couldn't answer tax question",
  "content": "User asked about 401k rollover rules...",
  "source": "agent",
  "agentId": "support-bot-v2",
  "sessionId": "sess_abc123",
  "conversationContext": {
    "messages": [...],
    "userSatisfaction": "negative",
    "handoffRequested": true
  },
  "metadata": {
    "model": "claude-sonnet-4",
    "latencyMs": 2400,
    "tokensUsed": 1580
  }
}
```

#### 3.3 Per-Conversation Feedback
**Priority: P0**
The killer feature for AI products. Not just board-level feedback, but per-interaction thumbs up/down with context.

```prisma
model ConversationFeedback {
  id             String   @id @default(cuid())
  organizationId String
  sessionId      String   // External session/conversation ID
  agentId        String?  // Which agent was running
  rating         Int      // -1 (bad), 0 (neutral), 1 (good)
  comment        String?  @db.Text
  context        Json?    // Conversation messages, agent state
  metadata       Json?    // Model, latency, tokens, etc.
  tags           String[] // Auto or manual tags
  userId         String?  // End user if identified
  createdAt      DateTime @default(now())

  organization   Organization @relation(...)

  @@index([organizationId, agentId, createdAt(sort: Desc)])
  @@index([organizationId, rating])
  @@index([organizationId, sessionId])
}
```

**Dashboard for conversation feedback:**
- Satisfaction rate over time (% positive)
- Satisfaction by agent/model
- Common negative feedback themes (AI-clustered)
- Drill into specific bad conversations
- Compare satisfaction across agent versions

#### 3.4 Agent SDKs
**Priority: P1**
Lightweight SDKs for common agent frameworks:

**Python SDK (`upvotely-python`):**
```python
from upvotely import Upvotely

client = Upvotely(api_key="uvly_...")

# Submit feedback
client.feedback.create(
    board="feature-requests",
    title="Add PDF export",
    content="Users keep asking for PDF export of reports",
    source="support-agent",
    customer_email="user@company.com"
)

# Log conversation feedback
client.conversations.rate(
    session_id="sess_123",
    agent_id="support-bot",
    rating=1,  # thumbs up
    context={"messages": conversation_history}
)

# Get priorities
priorities = client.insights.priorities(segment="enterprise")
```

**JavaScript/TypeScript SDK (`@upvotely/sdk`):**
```typescript
import { Upvotely } from '@upvotely/sdk';

const client = new Upvotely({ apiKey: 'uvly_...' });

await client.feedback.create({
  board: 'bugs',
  title: 'Agent hallucinated pricing',
  content: 'Told customer our Pro plan is $49 when it is $79',
  source: 'agent',
  agentId: 'sales-bot',
  sessionId: 'sess_456',
  metadata: { model: 'gpt-4o', confidence: 0.3 }
});
```

#### 3.5 Webhooks v2 (Agent-Friendly)
**Priority: P1**
Enhanced webhooks with agent-relevant events:

```
conversation.feedback.created   — New thumbs up/down
conversation.feedback.negative  — Alert on negative feedback (real-time)
post.trending                   — A post crossed a vote threshold
post.ai_categorized             — AI finished categorizing a post
insight.weekly_summary          — Weekly AI-generated insight report
customer.churn_risk             — Customer with negative sentiment trend
```

#### 3.6 Agent Monitoring Dashboard
**Priority: P2**
Purpose-built dashboard for AI agent operators:

- **Agent health overview:** Satisfaction rate, error rate, handoff rate per agent
- **Model comparison:** Side-by-side satisfaction scores across models
- **Failure analysis:** AI-clustered categories of what agents fail at
- **Improvement suggestions:** "Your agent fails most on X topic. Add these to its knowledge base."
- **A/B test results:** Compare feedback between agent versions

---

## Schema Changes Summary

### New Models
1. `Customer` — Customer/company profiles with MRR
2. `CustomerRequest` — Links customers to posts with source tracking
3. `Integration` — Third-party integration configs
4. `IntegrationSync` — Integration event/sync log
5. `ConversationFeedback` — Per-conversation thumbs up/down
6. `Notification` — In-app notifications
7. `NotificationPreference` — User notification settings
8. `Survey` — NPS/CSAT survey definitions
9. `SurveyResponse` — Survey answers linked to customers

### Modified Models
- `Post` — Add: `assigneeId`, `priorityScore`, `sentiment`, `aiCategory`, `aiTags`, `customerRequestCount`, `totalRequestingMrr`
- `Organization` — Add: `integrations` relation, `mcpEnabled`, `apiV2Enabled`
- `User` — Add: `notifications` relation, `notificationPreferences`
- `Vote` — Add: `note` (optional context), `isPrimary` (priority vote)

---

## Implementation Priority

### Phase 1: Foundation (Weeks 1-2)
- [ ] Customer model + Identify API
- [ ] Revenue-weighted prioritization on dashboard
- [ ] Internal comments UI
- [ ] MCP server (basic: list, create, vote, search)
- [ ] Conversation feedback model + API endpoint
- [ ] Per-conversation feedback dashboard

### Phase 2: Intelligence (Weeks 3-4)
- [ ] AI auto-categorization (on post create)
- [ ] Duplicate detection + merge suggestions
- [ ] Sentiment analysis
- [ ] Similar post suggestions on new submission
- [ ] Search with autocomplete
- [ ] Trends dashboard

### Phase 3: Integrations (Weeks 5-6)
- [ ] Slack integration (bidirectional)
- [ ] GitHub integration (issues sync)
- [ ] Linear integration (issues sync)
- [ ] Notification engine (email + in-app)
- [ ] Voter notification on status change
- [ ] Webhook v2 events

### Phase 4: Agent Market (Weeks 7-8)
- [ ] Full MCP server package
- [ ] Python SDK
- [ ] TypeScript SDK
- [ ] Agent monitoring dashboard
- [ ] API v2 (batch, trends, summary, insights)
- [ ] Enhanced widget types (sidebar, contextual)

### Phase 5: Growth (Weeks 9-10)
- [ ] SSO / Identify JS SDK
- [ ] Roadmap kanban view
- [ ] Changelog email + widget
- [ ] NPS/CSAT surveys
- [ ] CRM integrations (HubSpot, Salesforce)
- [ ] Vote on behalf + priority voting

---

## Competitive Positioning

| Capability | Canny | Linear | Featurebase | **Upvotely** |
|---|---|---|---|---|
| Public voting board | ✅ | ❌ | ✅ | ✅ |
| Customer revenue data | ✅ (paid) | ✅ | ❌ | ✅ |
| AI categorization | ✅ (Autopilot) | ✅ (Triage) | ❌ | ✅ |
| MCP server | ✅ (limited) | ✅ | ❌ | ✅ (full) |
| Conversation feedback | ❌ | ❌ | ❌ | ✅ |
| Agent SDKs | ❌ | ❌ | ❌ | ✅ |
| Agent monitoring | ❌ | ❌ | ❌ | ✅ |
| Per-user pricing | ✅ ($$$) | ✅ ($10/seat) | ✅ | ❌ (flat) |
| Open source | ❌ | ❌ | Partial | ✅ |
| Self-hostable | ❌ | ❌ | ❌ | ✅ |

**Upvotely's unique position:** The only platform that connects what your users say, what your team tracks, AND what your AI agents report — in one place, at a flat price, self-hostable.

---

## Pricing (Updated)

| Tier | Price | Target |
|---|---|---|
| **Free** | $0 | Solo devs, early stage. 1 board, 1 admin, unlimited voters, branding. |
| **Pro** | $29/mo | Growing teams. Unlimited boards, 5 admins, integrations, remove branding, conversation feedback, API. |
| **Scale** | $79/mo | Scaling products. Unlimited everything, custom domain, SSO, MCP server, agent SDKs, advanced analytics. |
| **Enterprise** | Custom | Large orgs. SLA, dedicated support, CRM integrations, white label, on-prem option. |

---

## Success Metrics

- **North star:** Organizations with active boards (>10 votes/week)
- **Activation:** Time from signup to first 10 votes < 48 hours
- **Agent market:** MCP server installations, API v2 calls/month
- **Revenue:** MRR growth, free-to-paid conversion rate
- **Retention:** Monthly active board retention > 85%
