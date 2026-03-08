'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Github, ArrowRight } from 'lucide-react';

const integrations = [
  {
    name: 'Slack',
    description: 'Send notifications and create feedback from Slack',
    icon: MessageSquare,
    href: '/dashboard/settings/integrations/slack',
    color: 'bg-[#4A154B]',
  },
  {
    name: 'GitHub',
    description: 'Create issues and sync status with GitHub',
    icon: Github,
    href: '/dashboard/settings/integrations/github',
    color: 'bg-[#24292f]',
  },
  {
    name: 'Linear',
    description: 'Create issues and sync status with Linear',
    icon: MessageSquare,
    href: '/dashboard/settings/integrations/linear',
    color: 'bg-[#5E6AD2]',
  },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground">Connect your tools to Upvotely</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.name}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${integration.color}`}>
                  <integration.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">{integration.name}</CardTitle>
                </div>
              </div>
              <CardDescription>{integration.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={integration.href}>
                <Button variant="outline" className="w-full">
                  Configure <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
