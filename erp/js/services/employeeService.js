// ============================================================
// THE ANT BOX ERP — employeeService.js
// Employee CRUD, department management, document uploads
// ============================================================

import getSupabaseClient from './supabaseClient.js';

function cleanText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeEmployeePayload(employeeData = {}) {
  const normalized = {
    ...employeeData,
    full_name: cleanText(employeeData.full_name),
    email: cleanText(employeeData.email),
    phone: cleanText(employeeData.phone),
    role: cleanText(employeeData.role) || 'employee',
    designation: cleanText(employeeData.designation),
    department_id: cleanText(employeeData.department_id),
    joining_date: cleanText(employeeData.joining_date),
    status: cleanText(employeeData.status) || 'active',
  };

  if ('salary' in normalized) {
    normalized.salary = normalized.salary === '' || normalized.salary == null
      ? null
      : Number(normalized.salary);
  }

  delete normalized.department_name;

  return normalized;
}

// ── Fetch All Employees ───────────────────────────────────────
export async function getEmployees({ page = 1, pageSize = 20, search = '', department = '', status = '', roleIn = null } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('employees')
    .select(`
      id, full_name, email, role, designation, phone,
      status, joining_date, salary, avatar_url,
      department:departments(id, name),
      created_at
    `, { count: 'exact' });

  // Handle empty roleIn explicitly because Supabase .in() with empty array errors or returns nothing, 
  // but we want to return nothing if roleIn is an empty array.
  if (roleIn && roleIn.length === 0) {
    return { data: [], count: 0, pages: 0 };
  }

  const allowedRoles = roleIn || ['super_admin', 'admin', 'hr', 'accountant', 'manager', 'employee', 'intern'];
  query = query.in('role', allowedRoles)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,designation.ilike.%${search}%`);
  }

  if (department) query = query.eq('department_id', department);
  if (status)     query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count, pages: Math.ceil(count / pageSize) };
}

// ── Get Single Employee ───────────────────────────────────────
export async function getEmployee(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('employees')
    .select(`
      *,
      department:departments(id, name),
      documents:employee_documents(id, file_name, file_url, doc_type, uploaded_at)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ── Create Employee ───────────────────────────────────────────
export async function createEmployee(employeeData) {
  const supabase = await getSupabaseClient();
  const payload = normalizeEmployeePayload(employeeData);

  // 1. Create auth user via admin (requires service role in edge function)
  // For now we insert into profiles (employee is invited separately)
  const { data, error } = await supabase
    .from('employees')
    .insert({
      ...payload,
      status: payload.status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Update Employee ───────────────────────────────────────────
export async function updateEmployee(id, updates) {
  const supabase = await getSupabaseClient();
  const payload = normalizeEmployeePayload(updates);
  const { data, error } = await supabase
    .from('employees')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Delete Employee ───────────────────────────────────────────
export async function deleteEmployee(id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('employees')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ── Get Departments ───────────────────────────────────────────
export async function getDepartments() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, created_at')
    .order('name');

  if (error) throw error;
  return data;
}

// ── Create Department ─────────────────────────────────────────
export async function createDepartment(name) {
  const supabase = await getSupabaseClient();
  const normalizedName = cleanText(name);
  if (!normalizedName) throw new Error('Department name is required.');

  const { data: existing, error: existingError } = await supabase
    .from('departments')
    .select('id, name, created_at')
    .ilike('name', normalizedName)
    .limit(1);

  if (existingError) throw existingError;
  if (existing?.length) return existing[0];

  const { data, error } = await supabase
    .from('departments')
    .insert({ name: normalizedName })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Upload Employee Document ──────────────────────────────────
export async function uploadDocument(employeeId, file, docType) {
  const supabase = await getSupabaseClient();

  const ext = file.name.split('.').pop();
  const path = `documents/${employeeId}/${docType}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('employee-files')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('employee-files')
    .getPublicUrl(path);

  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      employee_id: employeeId,
      file_name: file.name,
      file_url: publicUrl,
      file_path: path,
      doc_type: docType,
      file_size: file.size,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Delete Document ───────────────────────────────────────────
export async function deleteDocument(docId, filePath) {
  const supabase = await getSupabaseClient();

  await supabase.storage.from('employee-files').remove([filePath]);

  const { error } = await supabase
    .from('employee_documents')
    .delete()
    .eq('id', docId);

  if (error) throw error;
}

// ── Get Employee Stats ────────────────────────────────────────
export async function getEmployeeStats() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('employees')
    .select('role, status');

  if (error) throw error;

  const stats = {
    total: data.length,
    active: data.filter(e => e.status === 'active').length,
    inactive: data.filter(e => e.status === 'inactive').length,
    employees: data.filter(e => e.role === 'employee').length,
    interns: data.filter(e => e.role === 'intern').length,
    managers: data.filter(e => e.role === 'manager').length,
  };

  return stats;
}
