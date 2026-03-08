'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface Preferences {
  inAppNewPost: boolean;
  inAppStatusChange: boolean;
  inAppNewComment: boolean;
  inAppMention: boolean;
  emailNewPost: boolean;
  emailStatusChange: boolean;
  emailNewComment: boolean;
  emailMention: boolean;
  emailDigest: string;
}

const defaultPrefs: Preferences = {
  inAppNewPost: true,
  inAppStatusChange: true,
  inAppNewComment: true,
  inAppMention: true,
  emailNewPost: true,
  emailStatusChange: true,
  emailNewComment: true,
  emailMention: true,
  emailDigest: 'instant',
};

const notificationTypes = [
  { key: 'NewPost', label: 'New posts on your boards' },
  { key: 'StatusChange', label: 'Status changes on voted posts' },
  { key: 'NewComment', label: 'New comments on your posts' },
  { key: 'Mention', label: 'Mentions' },
];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences) setPrefs({ ...defaultPrefs, ...data.preferences });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification Preferences</h1>
        <p className="text-sm text-muted-foreground">Choose how you want to be notified</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>In-App Notifications</CardTitle>
          <CardDescription>Notifications shown in the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationTypes.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch
                checked={(prefs as Record<string, unknown>)[`inApp${key}`] as boolean}
                onCheckedChange={(checked) => setPrefs({ ...prefs, [`inApp${key}`]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>Notifications sent to your email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationTypes.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch
                checked={(prefs as Record<string, unknown>)[`email${key}`] as boolean}
                onCheckedChange={(checked) => setPrefs({ ...prefs, [`email${key}`]: checked })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between pt-4 border-t">
            <Label>Email frequency</Label>
            <select
              value={prefs.emailDigest}
              onChange={(e) => setPrefs({ ...prefs, emailDigest: e.target.value })}
              className="rounded-md border px-3 py-1 text-sm"
            >
              <option value="instant">Instant</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
              <option value="none">No emails</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save Preferences
      </Button>
    </div>
  );
}
