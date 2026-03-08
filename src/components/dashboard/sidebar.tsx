'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  MessageSquare,
  Map,
  Megaphone,
  BarChart3,
  Users,
  MessageCircle,
  Settings,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Boards', href: '/dashboard/boards', icon: MessageSquare },
  { name: 'Roadmap', href: '/dashboard/roadmap', icon: Map },
  { name: 'Changelog', href: '/dashboard/changelog', icon: Megaphone },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageCircle },
  { name: 'Team', href: '/dashboard/team', icon: Users },
];

const bottomNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'Help', href: '/docs', icon: HelpCircle },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r bg-card lg:block">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">
                U
              </span>
            </div>
            <span className="text-xl font-bold">Upvotely</span>
          </Link>
        </div>

        {/* Organization Switcher */}
        <div className="border-b p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                    A
                  </div>
                  <span className="truncate">Acme Inc</span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuItem>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                    A
                  </div>
                  <span>Acme Inc</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span className="text-muted-foreground">
                  + Create organization
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="border-t p-4">
          {bottomNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Upgrade Banner */}
        <div className="border-t p-4">
          <div className="rounded-lg bg-primary/5 p-4">
            <p className="text-sm font-medium">Upgrade to Pro</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Unlock unlimited boards, custom domains, and more.
            </p>
            <Button size="sm" className="mt-3 w-full">
              Upgrade
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
