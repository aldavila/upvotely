# Upvotely

**Feedback management that grows with you, not against you.**

Upvotely is an open-source Canny alternative with flat pricing. Collect, organize, and prioritize product feedback without per-user fees or surprise bills.

![Upvotely Screenshot](./public/screenshot.png)

## ✨ Features

### Core Features
- **📋 Feedback Boards** - Public and private boards with voting, comments, and status management
- **🗺️ Public Roadmap** - Visual Kanban-style roadmap your users can actually see
- **📢 Changelog** - Announce updates and link them to completed feedback
- **📊 Analytics** - Understand what your users really want

### What Makes Us Different
- **🆓 Unlimited Users** - No tracked-user BS. Ever.
- **💰 Flat Pricing** - Pay $29/mo, not $29-$661 based on success
- **🔌 All Integrations Included** - No integration tax
- **🚪 One-Click Cancel** - Self-service, prominent in settings
- **👤 Anonymous Voting** - Optional per board
- **🌍 Multi-Language** - i18n ready (EN/ES included)

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** NextAuth.js v5 (Google, GitHub, Credentials)
- **State:** TanStack Query
- **i18n:** next-intl

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/aldavila/upvotely.git
   cd upvotely
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your database URL and OAuth credentials.

4. **Set up the database**
   ```bash
   npm run db:push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open [http://localhost:3000](http://localhost:3000)**

### OAuth Setup

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Go to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID
5. Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs

#### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL to `http://localhost:3000/api/auth/callback/github`

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages (login, register)
│   ├── (dashboard)/       # Admin dashboard
│   ├── (marketing)/       # Landing page
│   ├── (public)/          # Public boards, roadmap, changelog
│   └── api/               # API routes
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── dashboard/         # Dashboard components
│   ├── boards/            # Board components
│   └── marketing/         # Landing page components
├── lib/                   # Utilities and config
│   ├── auth.ts           # NextAuth config
│   ├── db.ts             # Prisma client
│   └── validators/       # Zod schemas
├── hooks/                 # React hooks
└── styles/               # Global styles
```

## 🗄️ Database Schema

Key models:
- **Organization** - Multi-tenant workspace
- **User** - With org membership and roles
- **Board** - Feedback collection channels
- **Post** - Feedback submissions
- **Vote** - One vote per user per post
- **Comment** - Discussions on posts
- **Status** - Custom statuses per org
- **ChangelogEntry** - Product updates

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

## 🌐 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

### Docker

```bash
docker build -t upvotely .
docker run -p 3000:3000 upvotely
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built as an alternative to Canny.io
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

**Made with ❤️ for product teams everywhere**

[Website](https://upvotely.io) · [Documentation](https://docs.upvotely.io) · [Twitter](https://twitter.com/upvotely)
