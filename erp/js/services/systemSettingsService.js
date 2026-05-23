// ============================================================
// THE ANT BOX ERP — systemSettingsService.js
// System Settings Service (DB-first with local fallback)
// ============================================================

import getSupabaseClient from './supabaseClient.js';

const DEFAULT_SETTINGS = {
  company_name: { value: 'The Ant Box', type: 'string', desc: 'Company name' },
  company_email: { value: 'contact@theantbox.com', type: 'string', desc: 'Company email' },
  company_phone: { value: '+91 9999999999', type: 'string', desc: 'Company phone' },
  timezone: { value: 'Asia/Kolkata', type: 'string', desc: 'System timezone' },
  currency: { value: 'INR', type: 'string', desc: 'Default currency' },
  financial_year_start: { value: '04-01', type: 'string', desc: 'Financial year start (MM-DD)' },
  working_days_per_week: { value: '5', type: 'number', desc: 'Standard working days' },
  working_hours_per_day: { value: '8', type: 'number', desc: 'Standard working hours' },
  allow_employee_self_checkout: { value: 'true', type: 'boolean', desc: 'Can employees mark themselves absent?' },
  require_leave_approval: { value: 'true', type: 'boolean', desc: 'Require manager approval for leaves' },
  minimum_password_length: { value: '8', type: 'number', desc: 'Minimum password length' },
  enable_mfa: { value: 'false', type: 'boolean', desc: 'Enable multi-factor authentication' },
  session_timeout_minutes: { value: '30', type: 'number', desc: 'Session timeout in minutes' }
};

export async function getSystemSettings() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('*');

    if (error) {
      if (error.code === 'PGRST116' || error.status === 404 || error.message?.includes('does not exist')) {
        return getFallbackSettings();
      }
      throw error;
    }

    if (!data || data.length === 0) {
      return getFallbackSettings();
    }

    const settings = {};
    data.forEach(item => {
      settings[item.setting_key] = {
        id: item.id,
        value: item.setting_value,
        type: item.setting_type,
        desc: item.description
      };
    });
    return settings;
  } catch (err) {
    console.warn('DB settings read failed, using localStorage fallback:', err);
    return getFallbackSettings();
  }
}

export async function updateSystemSettings(settingsObject) {
  try {
    const supabase = await getSupabaseClient();
    const keys = Object.keys(settingsObject);

    for (const key of keys) {
      const val = String(settingsObject[key]);
      
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: key,
          setting_value: val,
          setting_type: DEFAULT_SETTINGS[key]?.type || 'string',
          description: DEFAULT_SETTINGS[key]?.desc || '',
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });

      if (error) throw error;
    }

    for (const key of keys) {
      saveFallbackSetting(key, settingsObject[key]);
    }

    return true;
  } catch (err) {
    console.warn('DB settings write failed, saving to localStorage fallback:', err);
    for (const key of Object.keys(settingsObject)) {
      saveFallbackSetting(key, settingsObject[key]);
    }
    return true;
  }
}

function getFallbackSettings() {
  const settings = {};
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    const stored = localStorage.getItem(`sys_setting_${key}`);
    settings[key] = {
      value: stored !== null ? stored : DEFAULT_SETTINGS[key].value,
      type: DEFAULT_SETTINGS[key].type,
      desc: DEFAULT_SETTINGS[key].desc
    };
  });
  return settings;
}

function saveFallbackSetting(key, value) {
  localStorage.setItem(`sys_setting_${key}`, String(value));
}
