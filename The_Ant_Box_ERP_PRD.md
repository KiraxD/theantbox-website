# The Ant Box ERP — Product Requirements Document (PRD)

## Project Overview

Build a complete ERP (Enterprise Resource Planning) system for The Ant Box while preserving the existing website’s branding, typography, spacing, colors, and overall premium startup UI aesthetic.

The ERP will serve as an internal operational platform for:
- HR Management
- Employee Management
- Intern Management
- Attendance
- Payroll
- Task Management
- Reports & Analytics
- Admin Controls

The system should feel like an official extension of The Ant Box website.

---

# Objectives

## Primary Goals
- Centralize company operations
- Reduce manual HR/admin work
- Improve employee and intern tracking
- Provide analytics and reporting
- Create scalable internal infrastructure

## Secondary Goals
- Maintain consistent brand identity
- Improve workflow visibility
- Simplify approvals and documentation

---

# Tech Stack

## Frontend
- HTML5
- CSS3
- Vanilla JavaScript

## Backend
- Supabase

## Database
- Supabase PostgreSQL

## Authentication
- Supabase Auth

## Storage
- Supabase Storage

---

# Design Requirements

## UI Direction
- Same typography style as The Ant Box
- Similar spacing and layout structure
- Minimal premium SaaS dashboard
- Responsive design
- Sidebar-based navigation
- Modern cards and analytics widgets
- Smooth transitions and interactions

## Theme
- Professional startup aesthetic
- Clean UI
- Lightweight interface
- Fast loading

---

# User Roles

## Super Admin
Full system access.

## HR
- Employee management
- Leave approvals
- Payroll access
- Reports

## Manager
- Team management
- Task assignment
- Attendance review

## Employee
- Profile access
- Attendance
- Tasks
- Payslips

## Intern
- Task access
- Training tracking
- Attendance

---

# Core Modules

# 1. Authentication Module

## Features
- Login
- Logout
- Session management
- Role-based access
- Password reset
- Invite users via email

## Pages
- login.html

---

# 2. Dashboard Module

## Features
- Total employees
- Active interns
- Pending approvals
- Attendance analytics
- Notifications
- Recent activity
- Payroll summary
- Quick actions

## Pages
- dashboard.html

---

# 3. Employee Management Module

## Features
- Add employee
- Edit employee
- Delete employee
- Employee profiles
- Department assignment
- Salary details
- Document uploads
- Search and filters

## Pages
- employees.html
- employee-details.html

---

# 4. Intern Management Module

## Features
- Intern onboarding
- Batch management
- Mentor allocation
- Progress tracking
- Evaluation reports
- Completion tracking

## Pages
- interns.html

---

# 5. Attendance Module

## Features
- Check-in/check-out
- Attendance logs
- Calendar view
- Leave requests
- Leave approvals
- Monthly reports
- Late tracking

## Pages
- attendance.html

---

# 6. Task Management Module

## Features
- Assign tasks
- Kanban board
- Deadlines
- Team assignment
- Priority levels
- Progress tracking
- Comments

## Pages
- tasks.html

---

# 7. Payroll Module

## Features
- Salary management
- Stipend tracking
- Bonuses
- Expense reimbursements
- Payslip generation

## Pages
- payroll.html

---

# 8. Reports Module

## Features
- Attendance reports
- Performance reports
- Department analytics
- Export CSV
- Export PDF
- Search and filters

## Pages
- reports.html

---

# 9. Admin Module

## Features
- Role permissions
- System settings
- Audit logs
- Notification controls
- User management

## Pages
- admin.html
- settings.html

---

# Database Schema

## Tables

### users
- id
- email
- role
- created_at

### employees
- id
- full_name
- department_id
- designation
- salary
- joining_date
- status

### interns
- id
- mentor_id
- batch
- progress
- status

### departments
- id
- name

### attendance
- id
- employee_id
- check_in
- check_out
- status

### leaves
- id
- employee_id
- leave_type
- start_date
- end_date
- approval_status

### payroll
- id
- employee_id
- salary
- bonus
- deductions
- generated_at

### tasks
- id
- assigned_to
- assigned_by
- priority
- deadline
- status

### notifications
- id
- user_id
- message
- read_status

### documents
- id
- employee_id
- file_url
- uploaded_at

### activity_logs
- id
- user_id
- action
- timestamp

---

# Supabase Requirements

## Authentication
- Email/password login
- Role-based access

## Security
- Row Level Security (RLS)
- Protected routes
- Permission-based access

## Storage
- Employee documents
- Payslips
- Reports

## Realtime
- Notifications
- Attendance updates
- Task updates

---

# Folder Structure

```plaintext
project-root/
│
├── index.html
├── dashboard.html
├── employees.html
├── interns.html
├── attendance.html
├── payroll.html
├── reports.html
├── admin.html
│
├── css/
│   ├── style.css
│   ├── dashboard.css
│   ├── employees.css
│   └── responsive.css
│
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── dashboard.js
│   ├── employees.js
│   ├── attendance.js
│   ├── payroll.js
│   └── supabase.js
│
└── assets/
    ├── icons/
    ├── images/
    └── fonts/
```

---

# Functional Requirements

## Performance
- Fast page load
- Optimized queries
- Minimal JS overhead

## Security
- Authentication required
- Protected APIs
- Session validation

## Scalability
- Modular architecture
- Expandable modules
- Reusable components

## Responsiveness
- Desktop optimized
- Tablet responsive
- Mobile compatible

---

# Future Enhancements

## AI Features
- AI attendance insights
- AI employee analytics
- AI-generated reports

## Advanced Features
- Internal chat system
- Organization hierarchy
- Automated onboarding
- Performance scoring

---

# Deliverables

## Frontend
- Full HTML pages
- CSS styling
- JavaScript functionality

## Backend
- Supabase integration
- Database schema
- Authentication setup

## Documentation
- PRD
- Database documentation
- Setup guide

---

# Final Goal

Create a production-ready ERP platform that:
- Matches The Ant Box branding
- Handles complete internal operations
- Is scalable and maintainable
- Uses simple and editable technologies
- Can be deployed quickly
