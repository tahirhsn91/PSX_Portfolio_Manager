import { Download, Upload, Trash2, Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useUIStore, usePortfolioStore } from '@/store';
import { storageService } from '@/services';
import { useTheme } from '@/hooks';

export function Settings() {
  const { settings, updateSettings, resetSettings } = useUIStore();
  const { portfolios, importPortfolios, clearAll } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const { theme, setTheme } = useTheme();
  const storageInfo = storageService.getStorageInfo();

  const handleExport = () => {
    storageService.exportToFile();
    addNotification({ type: 'success', title: 'Backup exported', message: 'JSON file downloaded.' });
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = storageService.importFromJSON(text);
        if (data.portfolios?.length) {
          importPortfolios(data.portfolios);
          addNotification({ type: 'success', title: `${data.portfolios.length} portfolio(s) imported` });
        }
      } catch (err) {
        addNotification({ type: 'error', title: 'Import failed', message: (err as Error).message });
      }
    };
    input.click();
  };

  const handleClearAll = () => {
    if (!window.confirm('Delete ALL portfolios and data? This cannot be undone.')) return;
    clearAll();
    addNotification({ type: 'info', title: 'All data cleared' });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value as 'light' | 'dark' | 'system')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  theme === value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Display Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Percentages</Label>
              <p className="text-xs text-muted-foreground">Display percentage changes in holdings</p>
            </div>
            <Switch
              checked={settings.showPercentages}
              onCheckedChange={(v) => updateSettings({ showPercentages: v })}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Auto-Refresh Interval</Label>
            <Select
              value={String(settings.autoRefreshInterval)}
              onValueChange={(v) => updateSettings({ autoRefreshInterval: Number(v) as typeof settings.autoRefreshInterval })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Disabled</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={resetSettings}>Reset to defaults</Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''} stored locally
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Storage usage */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Storage Used</span>
              <span className="font-medium">
                {(storageInfo.used / 1024).toFixed(1)} KB / {(storageInfo.total / 1024 / 1024).toFixed(0)} MB
              </span>
            </div>
            <Progress value={storageInfo.usedPercent} className="h-2" />
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={handleExport} className="flex-1">
              <Download className="mr-2 h-4 w-4" /> Export Backup
            </Button>
            <Button variant="outline" onClick={handleImport} className="flex-1">
              <Upload className="mr-2 h-4 w-4" /> Import Backup
            </Button>
          </div>

          <Separator />

          <Button variant="destructive" className="w-full" onClick={handleClearAll}>
            <Trash2 className="mr-2 h-4 w-4" /> Clear All Data
          </Button>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader><CardTitle>About</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">PSX Portfolio Manager</span> v1.0.0</p>
          <p>A client-side Pakistan Stock Exchange portfolio tracker. All data is stored in your browser's LocalStorage.</p>
          <p className="text-xs">Market data is simulated. For production use, connect a real data provider in <code className="text-primary">src/services/market/marketDataService.ts</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
