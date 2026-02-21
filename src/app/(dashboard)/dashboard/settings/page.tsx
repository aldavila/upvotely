import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building,
  CreditCard,
  Palette,
  Globe,
  Key,
  Webhook,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

async function getOrganization(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });
  return membership;
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await getOrganization(session.user.id);

  if (!membership) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">
          Please create an organization first.
        </p>
      </div>
    );
  }

  const { organization, role } = membership;
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || isOwner;

  const settingsSections = [
    {
      title: 'Organization',
      description: 'Manage your organization details and preferences',
      href: '/dashboard/settings/organization',
      icon: Building,
      adminOnly: false,
    },
    {
      title: 'Billing',
      description: 'Manage your subscription and payment methods',
      href: '/dashboard/settings/billing',
      icon: CreditCard,
      adminOnly: true,
      badge: organization.plan === 'free' ? 'Free Plan' : organization.plan,
    },
    {
      title: 'Branding',
      description: 'Customize colors, logo, and branding',
      href: '/dashboard/settings/branding',
      icon: Palette,
      adminOnly: true,
    },
    {
      title: 'Custom Domain',
      description: 'Use your own domain for feedback boards',
      href: '/dashboard/settings/domain',
      icon: Globe,
      adminOnly: true,
      badge: organization.customDomain ? 'Configured' : undefined,
    },
    {
      title: 'API Keys',
      description: 'Manage API keys for programmatic access',
      href: '/dashboard/settings/api',
      icon: Key,
      adminOnly: true,
    },
    {
      title: 'Webhooks',
      description: 'Configure webhooks for real-time notifications',
      href: '/dashboard/settings/webhooks',
      icon: Webhook,
      adminOnly: true,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization and account settings
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsSections.map((section) => {
          if (section.adminOnly && !isAdmin) return null;

          return (
            <Link key={section.href} href={section.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {section.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {section.badge && (
                      <Badge variant="secondary">{section.badge}</Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle>Danger Zone</CardTitle>
            </div>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Cancel Subscription</p>
                <p className="text-sm text-muted-foreground">
                  Downgrade to the free plan. One click, no questions asked.
                </p>
              </div>
              <Button variant="outline">Cancel Plan</Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-destructive p-4">
              <div>
                <p className="font-medium text-destructive">
                  Delete Organization
                </p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your organization and all its data.
                </p>
              </div>
              <Button variant="destructive">Delete</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
