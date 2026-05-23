const URL = 'https://sojqbyjioukfchdmstnz.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvanFieWppb3VrZmNoZG1zdG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDEwMDUsImV4cCI6MjA5NDg3NzAwNX0.UUxgLB33WK5sB5q8gY4bbgzMFrAMurU-_nh7qhAlb6w';

const tables = [
  'employees',
  'departments',
  'attendance',
  'tasks',
  'leave_requests',
  'leaves',
  'leave_types',
  'payroll',
  'invoices',
  'invoice_items',
  'clients',
  'leads',
  'crm_interactions',
  'sales_pipeline_stages',
  'inventory_items',
  'inventory_transactions',
  'vendors',
  'purchase_orders',
  'general_ledger',
  'sales_orders',
  'quotations',
  'notifications',
  'activity_logs',
  'system_settings'
];

async function check() {
  for (const t of tables) {
    try {
      const res = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1`, {
        headers: {
          'apikey': KEY,
          'Authorization': `Bearer ${KEY}`
        }
      });
      console.log(`${t}: ${res.status} ${res.statusText}`);
    } catch (e) {
      console.error(`${t}: Error - ${e.message}`);
    }
  }
}

check();
