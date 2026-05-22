const fs = require('fs');
const path = require('path');

const directory = 'c:/Users/KIIT0001/Desktop/theantbox.com/erp';
const pagesDir = path.join(directory, 'pages');

const htmlFiles = [
  path.join(directory, 'dashboard.html'),
  path.join(pagesDir, 'employees.html'),
  path.join(pagesDir, 'interns.html'),
  path.join(pagesDir, 'attendance.html'),
  path.join(pagesDir, 'tasks.html'),
  path.join(pagesDir, 'inventory.html'),
  path.join(pagesDir, 'invoices.html'),
  path.join(pagesDir, 'payroll.html'),
  path.join(pagesDir, 'reports.html'),
  path.join(pagesDir, 'settings.html'),
];

const newNavTemplate = `    <nav class="sidebar-nav">
      <div class="nav-section-label">Main</div>
      <a href="/erp/dashboard.html" class="nav-item" data-page="dashboard.html">Dashboard</a>
      <a href="/erp/pages/employees.html" class="nav-item" data-min-role="employee" data-page="employees.html">People</a>
      <a href="/erp/pages/attendance.html" class="nav-item" data-page="attendance.html">Attendance</a>
      <a href="/erp/pages/tasks.html" class="nav-item" data-page="tasks.html">Tasks</a>
      <a href="/erp/pages/inventory.html" class="nav-item" data-page="inventory.html">Inventory</a>
      <div class="nav-section-label" data-min-role="accountant">Finance</div>
      <a href="/erp/pages/payroll.html" class="nav-item" data-min-role="hr" data-page="payroll.html">Payroll</a>
      <a href="/erp/pages/invoices.html" class="nav-item" data-min-role="accountant" data-page="invoices.html">Invoices</a>
      <div class="nav-section-label" data-min-role="manager">Analytics</div>
      <a href="/erp/pages/reports.html" class="nav-item" data-min-role="manager" data-page="reports.html">Reports</a>
      <div class="nav-section-label">Account</div>
      <a href="/erp/pages/settings.html" class="nav-item" data-page="settings.html">Settings</a>
    </nav>`;

htmlFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace the entire <nav class="sidebar-nav"> block
  const navRegex = /<nav[^>]*class="sidebar-nav"[^>]*>[\s\S]*?<\/nav>/;
  
  // Check which page this is
  const fileName = path.basename(file);
  
  // Set the active class on the right item
  let updatedNav = newNavTemplate;
  if (fileName === 'interns.html') {
    updatedNav = updatedNav.replace(`class="nav-item" data-min-role="employee" data-page="employees.html"`, `class="nav-item active" data-min-role="employee" data-page="employees.html"`);
  } else {
    updatedNav = updatedNav.replace(`class="nav-item" data-page="${fileName}"`, `class="nav-item active" data-page="${fileName}"`);
    updatedNav = updatedNav.replace(`class="nav-item" data-min-role="hr" data-page="${fileName}"`, `class="nav-item active" data-min-role="hr" data-page="${fileName}"`);
    updatedNav = updatedNav.replace(`class="nav-item" data-min-role="accountant" data-page="${fileName}"`, `class="nav-item active" data-min-role="accountant" data-page="${fileName}"`);
    updatedNav = updatedNav.replace(`class="nav-item" data-min-role="manager" data-page="${fileName}"`, `class="nav-item active" data-min-role="manager" data-page="${fileName}"`);
  }
  
  // remove the data-page attributes
  updatedNav = updatedNav.replace(/ data-page="[^"]+"/g, '');

  content = content.replace(navRegex, updatedNav);
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
});
