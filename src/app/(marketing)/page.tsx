import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import {
  MessageSquare,
  Map,
  Megaphone,
  BarChart3,
  Zap,
  Palette,
  Check,
  X,
  ArrowRight,
  Star,
  Users,
  Shield,
  Clock,
} from 'lucide-react';

export default async function LandingPage() {
  const t = await getTranslations('landing');

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30 pt-24 pb-16 sm:pt-32 sm:pb-24">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="container relative mx-auto px-4 text-center">
          <Badge variant="secondary" className="mb-6">
            🚀 Now in public beta — 100% free to start
          </Badge>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="text-lg" asChild>
              <Link href="/register">
                {t('hero.cta')} <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg" asChild>
              <Link href="#features">{t('hero.ctaSecondary')}</Link>
            </Button>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span>Unlimited users</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span>Setup in 5 minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-y bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-12 text-muted-foreground">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">1,000+</div>
              <div className="text-sm">Teams trust us</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">50,000+</div>
              <div className="text-sm">Feedback collected</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">99.9%</div>
              <div className="text-sm">Uptime</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-3xl font-bold text-foreground">
                4.9 <Star className="h-6 w-6 fill-warning text-warning" />
              </div>
              <div className="text-sm">User rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <Badge variant="outline" className="mb-4">
              Features
            </Badge>
            <h2 className="text-3xl font-bold sm:text-4xl">
              {t('features.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              {t('features.subtitle')}
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<MessageSquare className="h-6 w-6" />}
              title={t('features.feedbackBoards.title')}
              description={t('features.feedbackBoards.description')}
            />
            <FeatureCard
              icon={<Map className="h-6 w-6" />}
              title={t('features.roadmap.title')}
              description={t('features.roadmap.description')}
            />
            <FeatureCard
              icon={<Megaphone className="h-6 w-6" />}
              title={t('features.changelog.title')}
              description={t('features.changelog.description')}
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title={t('features.analytics.title')}
              description={t('features.analytics.description')}
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title={t('features.integrations.title')}
              description={t('features.integrations.description')}
            />
            <FeatureCard
              icon={<Palette className="h-6 w-6" />}
              title={t('features.customization.title')}
              description={t('features.customization.description')}
            />
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <Badge variant="outline" className="mb-4">
              Compare
            </Badge>
            <h2 className="text-3xl font-bold sm:text-4xl">
              {t('comparison.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              {t('comparison.subtitle')}
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-4xl overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="pb-4 font-semibold">Feature</th>
                  <th className="pb-4 text-center font-semibold">
                    <span className="text-primary">Upvotely</span>
                  </th>
                  <th className="pb-4 text-center font-semibold text-muted-foreground">
                    Canny
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ComparisonRow
                  feature="Pricing Model"
                  upvotely="Flat $29/mo"
                  canny="$0-$661/mo per user"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="User Limits"
                  upvotely="Unlimited"
                  canny="25 free, then $$$"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="Integrations"
                  upvotely="All included"
                  canny="$948/year Pro tier"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="Self-service Cancel"
                  upvotely="One click"
                  canny="Contact support"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="Anonymous Voting"
                  upvotely="Yes, toggle per board"
                  canny="No"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="Multi-language"
                  upvotely="20+ languages"
                  canny="Beta, limited"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="Remove Branding"
                  upvotely="$29/mo"
                  canny="Enterprise only"
                  upvotelyBetter
                />
                <ComparisonRow
                  feature="API Access"
                  upvotely="All plans"
                  canny="Pro tier only"
                  upvotelyBetter
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <Badge variant="outline" className="mb-4">
              Pricing
            </Badge>
            <h2 className="text-3xl font-bold sm:text-4xl">
              {t('pricing.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              {t('pricing.subtitle')}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3">
            {/* Free Plan */}
            <div className="rounded-2xl border bg-card p-8">
              <h3 className="text-lg font-semibold">
                {t('pricing.free.name')}
              </h3>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-bold">
                  {t('pricing.free.price')}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {t('pricing.free.period')}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('pricing.free.description')}
              </p>
              <ul className="mt-8 space-y-3">
                {(t.raw('pricing.free.features') as string[]).map(
                  (feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      {feature}
                    </li>
                  )
                )}
              </ul>
              <Button className="mt-8 w-full" variant="outline" asChild>
                <Link href="/register">Get Started</Link>
              </Button>
            </div>

            {/* Starter Plan */}
            <div className="relative rounded-2xl border-2 border-primary bg-card p-8 shadow-lg">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge>Most Popular</Badge>
              </div>
              <h3 className="text-lg font-semibold">
                {t('pricing.starter.name')}
              </h3>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-bold">
                  {t('pricing.starter.price')}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {t('pricing.starter.period')}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('pricing.starter.description')}
              </p>
              <ul className="mt-8 space-y-3">
                {(t.raw('pricing.starter.features') as string[]).map(
                  (feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      {feature}
                    </li>
                  )
                )}
              </ul>
              <Button className="mt-8 w-full" asChild>
                <Link href="/register">Start Free Trial</Link>
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="rounded-2xl border bg-card p-8">
              <h3 className="text-lg font-semibold">{t('pricing.pro.name')}</h3>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-bold">
                  {t('pricing.pro.price')}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {t('pricing.pro.period')}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('pricing.pro.description')}
              </p>
              <ul className="mt-8 space-y-3">
                {(t.raw('pricing.pro.features') as string[]).map(
                  (feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      {feature}
                    </li>
                  )
                )}
              </ul>
              <Button className="mt-8 w-full" variant="outline" asChild>
                <Link href="/register">Start Free Trial</Link>
              </Button>
            </div>
          </div>

          {/* Unlimited Users Callout */}
          <div className="mx-auto mt-12 max-w-2xl rounded-xl bg-primary/5 p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-primary" />
              All plans include unlimited users
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll never charge you per tracked user. Your success shouldn't
              come with a penalty.
            </p>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-12">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <div className="font-semibold">Secure by Default</div>
                <div className="text-sm text-muted-foreground">
                  Encrypted & hosted on AWS
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" />
              <div>
                <div className="font-semibold">99.9% Uptime</div>
                <div className="text-sm text-muted-foreground">
                  Reliable infrastructure
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-primary" />
              <div>
                <div className="font-semibold">{"< 2s"} Load Time</div>
                <div className="text-sm text-muted-foreground">
                  Blazing fast performance
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">{t('cta.title')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {t('cta.subtitle')}
          </p>
          <Button size="lg" className="mt-8 text-lg" asChild>
            <Link href="/register">
              {t('cta.button')} <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 transition-shadow hover:shadow-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ComparisonRow({
  feature,
  upvotely,
  canny,
  upvotelyBetter = false,
}: {
  feature: string;
  upvotely: string;
  canny: string;
  upvotelyBetter?: boolean;
}) {
  return (
    <tr>
      <td className="py-4">{feature}</td>
      <td className="py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          {upvotelyBetter && <Check className="h-4 w-4 text-success" />}
          <span className={upvotelyBetter ? 'font-medium' : ''}>
            {upvotely}
          </span>
        </div>
      </td>
      <td className="py-4 text-center text-muted-foreground">{canny}</td>
    </tr>
  );
}
