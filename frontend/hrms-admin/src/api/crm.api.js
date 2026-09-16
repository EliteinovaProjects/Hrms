import axiosClient from "./axiosClient";
import { API } from "./endpoints";
import { createCrudApi } from "@/utils/crudFactory";

const C = API.CRM;

export const crmApi = {
  leads: {
    ...createCrudApi({ listUrl: C.LEADS, itemUrl: C.LEADS_ITEM }),
    update: (id, payload) => axiosClient.put(C.LEADS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.LEADS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.LEADS_ITEM(id), { is_active: true }),
    convert: (id, payload) => axiosClient.post(C.LEAD_CONVERT(id), payload || {}),
    assign: (id, assignedTo) => axiosClient.post(C.LEAD_ASSIGN(id), { assigned_to: assignedTo }),
    changeStatus: (id, status) => axiosClient.post(C.LEAD_STATUS_CHANGE(id), { status }),
    getAssignmentHistory: (id) => axiosClient.get(C.LEAD_ASSIGNMENT_HISTORY(id)),
    getStatusHistory: (id) => axiosClient.get(C.LEAD_STATUS_HISTORY(id)),
    report: (params) => axiosClient.get(C.LEADS_REPORT, { params, responseType: "blob" }),
    log: (params) => axiosClient.get(C.LEADS_LOG, { params }),
    logSummary: () => axiosClient.get(C.LEADS_LOG_SUMMARY),
  },

  leadUploads: {
    ...createCrudApi({ listUrl: C.LEAD_UPLOADS, itemUrl: C.LEAD_UPLOADS_ITEM }),
    deactivate: (id) => axiosClient.delete(`${C.LEAD_UPLOADS_ITEM(id)}/deactivate`),
    upload: (file, assignedTo) => {
      const formData = new FormData();
      formData.append("file", file);
      if (assignedTo) formData.append("assigned_to", assignedTo);
      return axiosClient.post(C.LEAD_UPLOADS, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    uploadPhoto: (file, assignedTo) => {
      const formData = new FormData();
      formData.append("file", file);
      if (assignedTo) formData.append("assigned_to", assignedTo);
      return axiosClient.post(C.LEAD_UPLOADS_PHOTO, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    template: () => axiosClient.get(C.LEAD_UPLOADS_TEMPLATE, { responseType: "blob" }),
    report: (batchId) =>
      axiosClient.get(C.LEAD_UPLOADS_REPORT(batchId), { responseType: "blob" }),
  },

  leadWeeklySnapshots: {
    ...createCrudApi({ listUrl: C.LEAD_WEEKLY_SNAPSHOTS, itemUrl: C.LEAD_WEEKLY_SNAPSHOTS_ITEM }),
    generate: (weekStartDate) =>
      axiosClient.post(C.LEAD_WEEKLY_SNAPSHOTS_GENERATE, { week_start_date: weekStartDate }),
  },

  departmentHeadcounts: {
    ...createCrudApi({ listUrl: C.DEPARTMENT_HEADCOUNTS, itemUrl: C.DEPARTMENT_HEADCOUNTS_ITEM }),
    update: (id, payload) => axiosClient.put(C.DEPARTMENT_HEADCOUNTS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.DEPARTMENT_HEADCOUNTS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.DEPARTMENT_HEADCOUNTS_ITEM(id), { is_active: true }),
  },

  employeeTargets: {
    ...createCrudApi({ listUrl: C.EMPLOYEE_TARGETS, itemUrl: C.EMPLOYEE_TARGETS_ITEM }),
    update: (id, payload) => axiosClient.put(C.EMPLOYEE_TARGETS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.EMPLOYEE_TARGETS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.EMPLOYEE_TARGETS_ITEM(id), { is_active: true }),
  },

  incentiveSlabs: {
    ...createCrudApi({ listUrl: C.INCENTIVE_SLABS, itemUrl: C.INCENTIVE_SLABS_ITEM }),
    update: (id, payload) => axiosClient.put(C.INCENTIVE_SLABS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.INCENTIVE_SLABS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.INCENTIVE_SLABS_ITEM(id), { is_active: true }),
  },

  membershipPlans: {
    ...createCrudApi({ listUrl: C.MEMBERSHIP_PLANS, itemUrl: C.MEMBERSHIP_PLANS_ITEM }),
    update: (id, payload) => axiosClient.put(C.MEMBERSHIP_PLANS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.MEMBERSHIP_PLANS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.MEMBERSHIP_PLANS_ITEM(id), { is_active: true }),
  },

  employeeIncentives: {
    ...createCrudApi({ listUrl: C.EMPLOYEE_INCENTIVES, itemUrl: C.EMPLOYEE_INCENTIVES_ITEM }),
    update: (id, payload) => axiosClient.put(C.EMPLOYEE_INCENTIVES_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.EMPLOYEE_INCENTIVES_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.EMPLOYEE_INCENTIVES_ITEM(id), { is_active: true }),
    calculate: (month, year) => axiosClient.post(C.EMPLOYEE_INCENTIVES_CALCULATE, { month, year }),
  },

  // Tier-based incentive engine (Bronze / Silver / Gold).
  incentives: {
    listTiers: () => axiosClient.get(C.INCENTIVE_TIERS),
    createTier: (payload) => axiosClient.post(C.INCENTIVE_TIERS, payload),
    updateTier: (id, payload) => axiosClient.put(C.INCENTIVE_TIERS_ITEM(id), payload),
    deactivateTier: (id) => axiosClient.delete(C.INCENTIVE_TIERS_ITEM(id)),
    run: (month, year) => axiosClient.post(C.INCENTIVE_RUN, { month, year }),
    runPayout: (month, year) => axiosClient.post(C.INCENTIVE_RUN_PAYOUT, { month, year }),
    weekly: (params) => axiosClient.get(C.INCENTIVE_WEEKLY, { params }),
    monthly: (params) => axiosClient.get(C.INCENTIVE_MONTHLY, { params }),
    quarterly: (params) => axiosClient.get(C.INCENTIVE_QUARTERLY, { params }),
    yearly: (params) => axiosClient.get(C.INCENTIVE_YEARLY, { params }),
    summary: (params) => axiosClient.get(C.INCENTIVE_SUMMARY, { params }),
    periodSummary: (params) => axiosClient.get(C.INCENTIVE_PERIOD_SUMMARY, { params }),
    generateInvoice: (payoutId) =>
      axiosClient.post(C.INCENTIVE_MONTHLY_INVOICE(payoutId)),
    invoices: (params) => axiosClient.get(C.INCENTIVE_INVOICES, { params }),
    invoicesReport: (params) =>
      axiosClient.get(C.INCENTIVE_INVOICES_REPORT, { params, responseType: "blob" }),
  },

  customers: {
    ...createCrudApi({ listUrl: C.CUSTOMERS, itemUrl: C.CUSTOMERS_ITEM }),
    update: (id, payload) => axiosClient.put(C.CUSTOMERS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.CUSTOMERS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.CUSTOMERS_ITEM(id), { is_active: true }),
  },

  followUps: {
    ...createCrudApi({ listUrl: C.FOLLOW_UPS, itemUrl: C.FOLLOW_UPS_ITEM }),
    update: (id, payload) => axiosClient.put(C.FOLLOW_UPS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.FOLLOW_UPS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.FOLLOW_UPS_ITEM(id), { is_active: true }),
  },

  meetings: {
    ...createCrudApi({ listUrl: C.MEETINGS, itemUrl: C.MEETINGS_ITEM }),
    update: (id, payload) => axiosClient.put(C.MEETINGS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.MEETINGS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.MEETINGS_ITEM(id), { is_active: true }),
  },

  quotations: {
    ...createCrudApi({ listUrl: C.QUOTATIONS, itemUrl: C.QUOTATIONS_ITEM }),
    update: (id, payload) => axiosClient.put(C.QUOTATIONS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.QUOTATIONS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.QUOTATIONS_ITEM(id), { is_active: true }),
  },

  invoices: {
    ...createCrudApi({ listUrl: C.INVOICES, itemUrl: C.INVOICES_ITEM }),
    update: (id, payload) => axiosClient.put(C.INVOICES_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.INVOICES_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.INVOICES_ITEM(id), { is_active: true }),
    report: (params) => axiosClient.get(C.INVOICES_REPORT, { params, responseType: "blob" }),
    download: (id) => axiosClient.get(C.INVOICES_DOWNLOAD(id), { responseType: "blob" }),
    generateIncentiveInvoice: (incentiveId) =>
      axiosClient.post(C.INVOICES_GENERATE_INCENTIVE, { incentive_id: incentiveId }),
  },

  payments: {
    ...createCrudApi({ listUrl: C.PAYMENTS, itemUrl: C.PAYMENTS_ITEM }),
    update: (id, payload) => axiosClient.put(C.PAYMENTS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.PAYMENTS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.PAYMENTS_ITEM(id), { is_active: true }),
  },

  supportTickets: {
    ...createCrudApi({ listUrl: C.SUPPORT_TICKETS, itemUrl: C.SUPPORT_TICKETS_ITEM }),
    update: (id, payload) => axiosClient.put(C.SUPPORT_TICKETS_ITEM(id), payload),
    deactivate: (id) => axiosClient.put(C.SUPPORT_TICKETS_ITEM(id), { is_active: false }),
    reactivate: (id) => axiosClient.put(C.SUPPORT_TICKETS_ITEM(id), { is_active: true }),
    getHistory: (id) => axiosClient.get(C.SUPPORT_TICKETS_HISTORY(id)),
    addHistory: (id, payload) => axiosClient.post(C.SUPPORT_TICKETS_HISTORY(id), payload),
  },
};