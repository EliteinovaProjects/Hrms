export const API = {
  AUTH: {
    REGISTER: "/auth/register",
    LOGIN: "/auth/login",
    ME: "/auth/me",
    LOGOUT: "/auth/logout",
    DEPARTMENTS: "/auth/departments",
    DESIGNATIONS: "/auth/designations",
    FORGOT_PASSWORD: "/auth/forgot-password",
    VERIFY_OTP: "/auth/verify-otp",
    RESET_PASSWORD: "/auth/reset-password",
    CHANGE_PASSWORD: "/auth/change-password",
  },

  FEEDBACK: {
    LIST: "/feedback/",
    CREATE: "/feedback/",
    GET: (id) => `/feedback/${id}`,
    UPDATE: (id) => `/feedback/${id}`,
    CATEGORIES: "/feedback/categories",
  },

  USERS: {
    LIST: "/users/",
    CREATE: "/users/",
    COUNT: "/users/count",
    LOGIN: "/users/login",
    GET: (id) => `/users/${id}`,
    UPDATE: (id) => `/users/${id}`,
    DELETE: (id) => `/users/${id}`,
    PROFILE_GET: (id) => `/users/profile/${id}`,
    PROFILE_UPDATE: (id) => `/users/profile/${id}`,
  },

  EMPLOYEES: {
    LIST: "/employees/",
    CREATE: "/employees/",
    GET: (id) => `/employees/${id}`,
    UPDATE: (id) => `/employees/${id}`,
    DELETE: (id) => `/employees/${id}`,

    CRM_DIRECTORY: "/employees/crm-directory",

    SALARY_LIST: "/employees/salary",
    SALARY_GET: (id) => `/employees/${id}/salary`,
    SALARY_UPDATE: (id) => `/employees/${id}/salary`,
    SALARY_RESET: (id) => `/employees/${id}/salary`,

    PAYSLIP: (id) => `/employees/${id}/payslip`,

    CHECKIN: "/employees/checkin",
    CHECKOUT: "/employees/checkout",

    ATTENDANCE_RESET: "/employees/attendance/reset",
    MANUAL_ATTENDANCE: "/employees/manual-attendance",
    MANUAL_ATTENDANCE_ITEM: (id) =>
      `/employees/manual-attendance/${id}`,

    ATTENDANCE: (id) =>
      `/employees/${id}/attendance`,
  },

  MASTER: {
    DEPARTMENTS: "/departments",
    DEPARTMENT_GET: (id) => `/departments/${id}`,
    DEPARTMENT_UPDATE: (id) => `/departments/${id}`,
    DEPARTMENT_DELETE: (id) => `/departments/${id}`,

    DESIGNATIONS: "/designations",
    DESIGNATION_GET: (id) => `/designations/${id}`,
    DESIGNATION_UPDATE: (id) => `/designations/${id}`,
    DESIGNATION_DELETE: (id) => `/designations/${id}`,

    LEAVE_TYPES: "/leave-types",
    LEAVE_TYPE_GET: (id) => `/leave-types/${id}`,
    LEAVE_TYPE_UPDATE: (id) => `/leave-types/${id}`,
    LEAVE_TYPE_DELETE: (id) => `/leave-types/${id}`,

    HOLIDAYS: "/organization/holiday",
    HOLIDAY_GET: (id) => `/organization/holiday/${id}`,
    HOLIDAY_UPDATE: (id) => `/organization/holiday/${id}`,
    HOLIDAY_DELETE: (id) => `/organization/holiday/${id}`,

    HOLIDAY_SYNC_GOVERNMENT:
      "/organization/holiday/sync-government",

    HOLIDAY_UNSYNC_GOVERNMENT:
      "/organization/holiday/unsync-government",

    HOLIDAY_PREVIEW_GOVERNMENT:
      "/organization/holiday/preview-government",

    HOLIDAY_SYNC_OFFICE_SUNDAYS:
      "/organization/holiday/sync-office-sundays",

    HOLIDAY_SYNC_OFFICE_SUNDAYS_BY_YEAR:
      "/organization/holiday/sync-office-sundays",

    HOLIDAY_REPORT:
      "/organization/holiday/report",

    COMPANIES: "/companies",
    COMPANY_GET: (id) => `/companies/${id}`,
    COMPANY_UPDATE: (id) => `/companies/${id}`,
    COMPANY_DELETE: (id) => `/companies/${id}`,

    BRANCHES: "/branches",
    BRANCH_GET: (id) => `/branches/${id}`,
    BRANCH_UPDATE: (id) => `/branches/${id}`,
    BRANCH_DELETE: (id) => `/branches/${id}`,

    COMPANY_BRANCHES: (companyId) =>
      `/companies/${companyId}/branches`,
  },

  ATTENDANCE: {
    LIST: "/attendance/",
    MONTHLY_SUMMARY: "/attendance/monthly-summary",
    REPORT: "/attendance/report",
    SALARY_REPORT: "/attendance/salary-report",
    SETTINGS: "/attendance/settings",
  },

  NETWORK: {
    LIST: "/network/",
  },

  LEAVES: {
    LIST: "/leaves/",
    CREATE: "/leaves/",
    GET: (id) => `/leaves/${id}`,
    UPDATE: (id) => `/leaves/${id}`,
    DELETE: (id) => `/leaves/${id}`,
    APPROVE: (id) => `/leaves/${id}/approve`,
    REJECT: (id) => `/leaves/${id}/reject`,
    MONTHLY_SUMMARY: "/leaves/monthly-summary",
  },

  /*
   * ============================================================
   * OFFICE EXPENSES
   * ============================================================
   *
   * Employee Expenses has been converted to Office Expenses.
   *
   * Supports:
   * - Day-to-Day Expenses
   * - Office In Purchase
   * - Office Out Purchase
   * - Collection Status
   * - Collection Mode
   * - Received Expenses
   * - Weekly Reports
   * - Monthly Reports
   * - Quarterly Reports
   */

  OFFICE_EXPENSES: {
    /*
     * Main Office Expenses list
     */
    LIST: "/office-expenses/",

    /*
     * Create Office Expense
     */
    CREATE: "/office-expenses/",

    /*
     * Get single Office Expense
     */
    GET: (id) =>
      `/office-expenses/${id}`,

    /*
     * Update Office Expense
     */
    UPDATE: (id) =>
      `/office-expenses/${id}`,

    /*
     * Deactivate Office Expense
     */
    DEACTIVATE: (id) =>
      `/office-expenses/${id}/deactivate`,

    /*
     * Purchase Types
     *
     * Expected values:
     * - Office In Purchase
     * - Office Out Purchase
     */
    PURCHASE_TYPES:
      "/office-expenses/purchase-types",

    /*
     * Collection Modes
     *
     * Expected values:
     * - Cash
     * - UPI
     * - Bank Transfer
     * - Card
     * - Other
     */
    COLLECTION_MODES:
      "/office-expenses/collection-modes",

    /*
     * Weekly / Monthly / Quarterly Reports
     */
    REPORTS:
      "/office-expenses/reports",

    /*
     * Received / Collected Expenses
     */
    RECEIVED:
      "/office-expenses/received",
  },

  /*
   * ============================================================
   * ROLES
   * ============================================================
   */

  ROLES: {
    LIST: "/roles/",
    CREATE: "/roles/",
    GET: (id) => `/roles/${id}`,
    UPDATE: (id) => `/roles/${id}`,
    DELETE: (id) => `/roles/${id}`,

    PERMISSIONS_CATALOG:
      "/roles/permissions/catalog",

    ROLE_PERMISSIONS: (id) =>
      `/roles/${id}/permissions`,
  },

  /*
   * ============================================================
   * DASHBOARD
   * ============================================================
   */

  DASHBOARD: {
    STATS: "/dashboard/stats",
  },

  /*
   * ============================================================
   * EMPLOYEE LIFECYCLE
   * ============================================================
   */

  EMPLOYEE_LIFECYCLE: {
    DOCUMENTS: "/employee-documents/",
    DOCUMENTS_ITEM: (id) =>
      `/employee-documents/${id}`,

    PERMISSIONS: "/employee-permissions/",
    PERMISSIONS_ITEM: (id) =>
      `/employee-permissions/${id}`,

    OVERTIME: "/overtime/",
    OVERTIME_ITEM: (id) =>
      `/overtime/${id}`,

    PAYROLL: "/payroll/",
    PAYROLL_ITEM: (id) =>
      `/payroll/${id}`,

    PAYROLL_REPORT: "/payroll/report",
    PAYROLL_GENERATE: "/payroll/generate",

    PERFORMANCE: "/performance/",
    PERFORMANCE_ITEM: (id) =>
      `/performance/${id}`,

    TRAINING: "/training/",
    TRAINING_ITEM: (id) =>
      `/training/${id}`,

    PROMOTIONS: "/promotions/",
    PROMOTIONS_ITEM: (id) =>
      `/promotions/${id}`,

    TRANSFERS: "/transfers/",
    TRANSFERS_ITEM: (id) =>
      `/transfers/${id}`,

    RESIGNATIONS: "/resignations/",
    RESIGNATIONS_ITEM: (id) =>
      `/resignations/${id}`,

    EXIT_MANAGEMENT: "/exit-management/",
    EXIT_MANAGEMENT_ITEM: (id) =>
      `/exit-management/${id}`,
  },

  /*
   * ============================================================
   * CRM
   * ============================================================
   */

  CRM: {
    LEADS: "/leads/",
    LEADS_ITEM: (id) =>
      `/leads/${id}`,

    LEAD_CONVERT: (id) =>
      `/leads/${id}/convert`,

    LEAD_UPLOADS: "/lead-uploads/",
    LEAD_UPLOADS_ITEM: (id) =>
      `/lead-uploads/${id}`,

    LEAD_UPLOADS_PHOTO:
      "/lead-uploads/photo",

    LEAD_UPLOADS_TEMPLATE:
      "/lead-uploads/template",

    LEAD_UPLOADS_REPORT: (batchId) =>
      `/lead-uploads/${batchId}/report`,

    LEADS_REPORT:
      "/leads/report",

    LEADS_LOG:
      "/leads/log",

    LEADS_LOG_SUMMARY:
      "/leads/log/summary",

    LEAD_ASSIGN: (id) =>
      `/leads/${id}/assign`,

    LEAD_ASSIGNMENT_SETTINGS:
      "/leads/assignment-settings",

    LEAD_AUTO_ASSIGN_NOW:
      "/leads/auto-assign-now",

    LEAD_UPLOADS_DELETE: (batchId) =>
      `/lead-uploads/${batchId}`,

    LEAD_STATUS_CHANGE: (id) =>
      `/leads/${id}/status`,

    LEAD_ASSIGNMENT_HISTORY: (id) =>
      `/leads/${id}/assignment-history`,

    LEAD_STATUS_HISTORY: (id) =>
      `/leads/${id}/status-history`,

    INCENTIVE_SLABS:
      "/incentive-slabs/",

    INCENTIVE_SLABS_ITEM: (id) =>
      `/incentive-slabs/${id}`,

    EMPLOYEE_INCENTIVES:
      "/employee-incentives/",

    EMPLOYEE_INCENTIVES_ITEM: (id) =>
      `/employee-incentives/${id}`,

    EMPLOYEE_INCENTIVES_CALCULATE:
      "/employee-incentives/calculate",

    INCENTIVE_TIERS:
      "/incentives/tiers",

    INCENTIVE_TIERS_ITEM: (id) =>
      `/incentives/tiers/${id}`,

    INCENTIVE_RUN:
      "/incentives/run",

    INCENTIVE_RUN_PAYOUT:
      "/incentives/run-payout",

    INCENTIVE_WEEKLY:
      "/incentives/weekly",

    INCENTIVE_MONTHLY:
      "/incentives/monthly",

    INCENTIVE_QUARTERLY:
      "/incentives/quarterly",

    INCENTIVE_YEARLY:
      "/incentives/yearly",

    INCENTIVE_SUMMARY:
      "/incentives/summary",

    INCENTIVE_MONTHLY_INVOICE: (id) =>
      `/incentives/monthly/${id}/invoice`,

    INCENTIVE_INVOICES:
      "/incentives/invoices",

    INCENTIVE_INVOICES_REPORT:
      "/incentives/invoices/report",

    EMPLOYEE_TARGETS:
      "/employee-targets/",

    EMPLOYEE_TARGETS_ITEM: (id) =>
      `/employee-targets/${id}`,

    MEMBERSHIP_PLANS:
      "/membership-plans/",

    MEMBERSHIP_PLANS_ITEM: (id) =>
      `/membership-plans/${id}`,

    INCENTIVE_PERIOD_SUMMARY:
      "/incentives/period-summary",

    LEAD_WEEKLY_SNAPSHOTS:
      "/lead-weekly-snapshots/",

    LEAD_WEEKLY_SNAPSHOTS_ITEM: (id) =>
      `/lead-weekly-snapshots/${id}`,

    LEAD_WEEKLY_SNAPSHOTS_GENERATE:
      "/lead-weekly-snapshots/generate",

    CUSTOMERS:
      "/customers/",

    CUSTOMERS_ITEM: (id) =>
      `/customers/${id}`,

    DEPARTMENT_HEADCOUNTS:
      "/department-headcounts/",

    DEPARTMENT_HEADCOUNTS_ITEM: (id) =>
      `/department-headcounts/${id}`,

    FOLLOW_UPS:
      "/follow-ups/",

    FOLLOW_UPS_ITEM: (id) =>
      `/follow-ups/${id}`,

    MEETINGS:
      "/meetings/",

    MEETINGS_ITEM: (id) =>
      `/meetings/${id}`,

    QUOTATIONS:
      "/quotations/",

    QUOTATIONS_ITEM: (id) =>
      `/quotations/${id}`,

    INVOICES:
      "/invoices/",

    INVOICES_ITEM: (id) =>
      `/invoices/${id}`,

    INVOICES_REPORT:
      "/invoices/report",

    INVOICES_GENERATE_INCENTIVE:
      "/invoices/generate-incentive-invoice",

    INVOICES_DOWNLOAD: (id) =>
      `/invoices/${id}/download`,

    PAYMENTS:
      "/payments/",

    PAYMENTS_ITEM: (id) =>
      `/payments/${id}`,

    SUPPORT_TICKETS:
      "/support-tickets/",

    SUPPORT_TICKETS_ITEM: (id) =>
      `/support-tickets/${id}`,

    SUPPORT_TICKETS_HISTORY: (id) =>
      `/support-tickets/${id}/history`,
  },

  /*
   * ============================================================
   * FINANCE
   * ============================================================
   */

  FINANCE: {
    ACCOUNTS: "/accounts/",
    ACCOUNTS_ITEM: (id) =>
      `/accounts/${id}`,

    VENDORS: "/vendors/",
    VENDORS_ITEM: (id) =>
      `/vendors/${id}`,

    EXPENSES: "/expenses/",
    EXPENSES_ITEM: (id) =>
      `/expenses/${id}`,

    EXPENSES_REPORT:
      "/expenses/report",

    INCOME: "/income/",
    INCOME_ITEM: (id) =>
      `/income/${id}`,
  },

  /*
   * ============================================================
   * REPORTS
   * ============================================================
   */

  REPORTS: {
    ATTENDANCE:
      "/attendance/report",

    LEAVE:
      "/leaves/report",

    PAYROLL:
      "/payroll/report",

    EMPLOYEE:
      "/employees/report",

    CRM:
      "/invoices/report",

    FINANCE:
      "/expenses/report",

    /*
     * Office Expenses Reports
     */
    OFFICE_EXPENSES:
      "/office-expenses/reports",

    OFFICE_EXPENSES_WEEKLY:
      "/office-expenses/reports?period=week",

    OFFICE_EXPENSES_MONTHLY:
      "/office-expenses/reports?period=month",

    OFFICE_EXPENSES_QUARTERLY:
      "/office-expenses/reports?period=quarter",
  },
};