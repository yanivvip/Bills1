import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface OrgSettings {
  remind_monthly: boolean;
  remind_day: number;
  usage_alert: boolean;
  usage_threshold_pct: number;
  contract_alert: boolean;
  contract_alert_days: number;
  /** how long the photos of meters are kept; 0 = for ever */
  photo_retention_months: number;
}
export const DEFAULT_SETTINGS: OrgSettings = { remind_monthly: true, remind_day: 1, usage_alert: true, usage_threshold_pct: 30, contract_alert: true, contract_alert_days: 60, photo_retention_months: 6 };

export async function loadOrgSettings(): Promise<OrgSettings> {
  const { data } = await supabase.from('org_settings').select('remind_monthly,remind_day,usage_alert,usage_threshold_pct,contract_alert,contract_alert_days,photo_retention_months').maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data as Partial<OrgSettings> | null) ?? {}) };
}

// The landlord's alert and photo settings; a change is saved at once.
export function useOrgSettings(orgId: string) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void loadOrgSettings().then(setSettings);
  }, [orgId]);
  const save = useCallback(
    async (patch: Partial<OrgSettings>) => {
      const next = { ...(settings ?? DEFAULT_SETTINGS), ...patch };
      setSettings(next);
      const { error: err } = await supabase.from('org_settings').upsert({ org_id: orgId, ...next, updated_at: new Date().toISOString() });
      setError(err?.message ?? '');
    },
    [orgId, settings],
  );
  return { settings, save, error };
}
