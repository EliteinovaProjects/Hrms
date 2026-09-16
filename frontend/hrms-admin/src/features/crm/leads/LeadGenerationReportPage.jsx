import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import DataTable from "@/components/table/DataTable";
import TableSearchBar from "@/components/table/TableSearchBar";

import { useToast } from "@/components/feedback/Toast";
import { useFileDownload } from "@/hooks/useFileDownload";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { crmApi } from "@/api/crm.api";

import { useLeads } from "./useLeads";
import { useLeadUploads } from "./useLeadUpload";

/* =========================================================
   HELPERS
========================================================= */

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getEmployeeName(employee) {
  if (!employee) return "-";
  return (
    [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() ||
    employee.employee_code ||
    "-"
  );
}

const STATUS_BADGE_CLASS = {
  New: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  Contacted: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  Converted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  Lost: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

function getStatusBadgeClass(status) {
  return STATUS_BADGE_CLASS[status] || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300";
}

/* =========================================================
   LEAD DETAILS MODAL
========================================================= */

function LeadDetailsModal({ lead, onClose }) {
  if (!lead) return null;

  return (
    <Modal open={!!lead} onClose={onClose} title={`Lead #${lead.id}`}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {lead.lead_name || "-"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Created {formatDateTime(lead.created_at)}
            </p>
          </div>
          <Badge className={getStatusBadgeClass(lead.status)}>{lead.status || "-"}</Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Contact Number
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lead.contact_number || "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Email
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lead.email || "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Source
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lead.source || "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Groom For Whom
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lead.groom_for_whom || "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Location
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lead.location || "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Assigned To
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {getEmployeeName(lead.assignee)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Created By
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {getEmployeeName(lead.creator)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Status
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {lead.status || "-"}
            </p>
          </div>
        </div>

        {lead.notes && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700 dark:text-slate-200">
              {lead.notes}
            </p>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-white/10">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function LeadGenerationReportPage() {
  const { showToast } = useToast();
  const { downloadBlob } = useFileDownload();
  const { value: search, setValue: setSearch } = useDebouncedSearch();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [tab, setTab] = useState("leads"); // "leads" | "uploads"

  const { data, isLoading, isError } = useLeads({ page: 1, per_page: 1000 });
  const allLeads = data?.items || [];

  // "Marketing Uploads" tab — every batch a CRM Marketing employee (or
  // admin) has uploaded, one row per Excel/photo upload, with a View
  // Details modal (reusing the same batch->leads lookup the Lead Upload
  // screen's own preview uses) and a per-batch Excel download.
  const { data: uploadsData, isLoading: uploadsLoading, isError: uploadsError } = useLeadUploads({
    page: 1,
    per_page: 1000,
  });
  const uploadBatches = uploadsData?.items || [];

  const [previewBatch, setPreviewBatch] = useState(null);
  const [previewLeads, setPreviewLeads] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openBatchPreview = async (batch) => {
    setPreviewBatch(batch);
    setPreviewLeads(null);
    setPreviewLoading(true);
    try {
      const res = await crmApi.leads.list({ upload_batch_id: batch.id, per_page: 500 });
      setPreviewLeads(res?.data?.data?.items || []);
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.message || "Failed to load leads for this upload",
        "error"
      );
      setPreviewLeads([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeBatchPreview = () => {
    setPreviewBatch(null);
    setPreviewLeads(null);
  };

  const downloadUploadReport = useMutation({
    mutationFn: async (batchId) => {
      const res = await crmApi.leadUploads.report(batchId);
      downloadBlob(res, `lead_upload_${batchId}.xlsx`);
      return res;
    },
    onSuccess: () => showToast("Upload downloaded", "success"),
    onError: (error) =>
      showToast(
        error?.response?.data?.message || "Failed to download this upload",
        "error"
      ),
  });

  const getExecutiveName = (employee) => {
    if (!employee) return "-";
    return (
      [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() ||
      employee.employee_code ||
      "-"
    );
  };

  /* =======================================================
     ASSIGN LEADS — Manual (admin assigns each lead by hand, from the
     Leads screen's own per-row "assign" action) vs Automatic (every
     unassigned lead is randomly handed to an active CRM employee once a
     day at 9:00 AM — see backend app.py's opportunistic trigger).
  ======================================================= */

  const { data: assignmentSettingsData } = useQuery({
    queryKey: ["lead-assignment-settings"],
    queryFn: async () => (await crmApi.leads.getAssignmentSettings()).data.data,
  });

  const [assignmentMode, setAssignmentMode] = useState("Manual");

  useEffect(() => {
    if (assignmentSettingsData?.mode) {
      setAssignmentMode(assignmentSettingsData.mode);
    }
  }, [assignmentSettingsData]);

  const updateAssignmentMode = useMutation({
    mutationFn: (mode) => crmApi.leads.updateAssignmentSettings(mode),
    onSuccess: (_res, mode) => {
      setAssignmentMode(mode);
      showToast(`Lead assignment set to ${mode}`, "success");
    },
    onError: (error) =>
      showToast(
        error?.response?.data?.message || "Failed to update assignment mode",
        "error"
      ),
  });

  const runAutoAssignNow = useMutation({
    mutationFn: () => crmApi.leads.autoAssignNow(),
    onSuccess: (res) =>
      showToast(res?.data?.message || "Automatic assignment run complete", "success"),
    onError: (error) =>
      showToast(
        error?.response?.data?.message || "Failed to run automatic assignment",
        "error"
      ),
  });

  /* =======================================================
     FILTERED — mirrors the backend report's date-range filter
     so the preview table always matches what Download Excel
     would produce for the same range.
  ======================================================= */

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return allLeads.filter((lead) => {
      if (lead.created_at) {
        const createdAt = new Date(lead.created_at);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
      }

      if (normalizedSearch) {
        const haystack = [lead.lead_name, lead.contact_number, lead.email, lead.source]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [allLeads, search, fromDate, toDate]);

  const downloadReport = useMutation({
    mutationFn: async () => {
      const params = {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      };
      const res = await crmApi.leads.report(params);
      downloadBlob(res, "lead_generation_report.xlsx");
      return res;
    },
    onSuccess: () => showToast("Lead Generation Report downloaded", "success"),
    onError: (error) =>
      showToast(
        error?.response?.data?.message || "Failed to download the report",
        "error"
      ),
  });

  // Per-row download — same endpoint, scoped to a single lead_id, so each
  // row can be exported on its own instead of only the whole date range.
  const downloadLead = useMutation({
    mutationFn: async (lead) => {
      const res = await crmApi.leads.report({ lead_id: lead.id });
      downloadBlob(res, `lead_${lead.id}.xlsx`);
      return res;
    },
    onSuccess: () => showToast("Lead downloaded", "success"),
    onError: (error) =>
      showToast(
        error?.response?.data?.message || "Failed to download this lead",
        "error"
      ),
  });

  const columns = [
    {
      key: "lead_name",
      label: "Lead Name",
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelectedLead(row)}
          className="text-left font-semibold text-slate-800 underline decoration-transparent underline-offset-2 transition hover:text-primary-600 hover:decoration-primary-400 dark:text-white dark:hover:text-primary-400"
        >
          {row.lead_name || "-"}
        </button>
      ),
    },
    {
      key: "contact_number",
      label: "Contact",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{row.contact_number || "-"}</span>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{row.email || "-"}</span>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{row.source || "-"}</span>
      ),
    },
    {
      key: "groom_for_whom",
      label: "Groom For Whom",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{row.groom_for_whom || "-"}</span>
      ),
    },
    {
      key: "location",
      label: "Location",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{row.location || "-"}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge className={getStatusBadgeClass(row.status)}>{row.status || "-"}</Badge>,
    },
    {
      key: "assignee",
      label: "Assigned To",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{getEmployeeName(row.assignee)}</span>
      ),
    },
    {
      key: "created_at",
      label: "Created At",
      render: (row) => (
        <span className="text-slate-600 dark:text-slate-300">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => {
        const isDownloadingRow =
          downloadLead.isPending && downloadLead.variables?.id === row.id;

        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setSelectedLead(row)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-600 transition hover:bg-primary-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-primary-400 dark:hover:bg-primary-500/10"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => downloadLead.mutate(row)}
              disabled={isDownloadingRow}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10"
            >
              {isDownloadingRow ? "Downloading..." : "Download"}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Lead Generation Report
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Preview leads in the table below, download every matching lead as one Excel file, or use
          each row's own Download button to export just that lead
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Assign Leads</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Manual — assign each lead yourself from the Leads screen. Automatic — every
              unassigned lead is randomly handed to an active CRM employee once a day at 9:00 AM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assignmentMode}
              onChange={(event) => updateAssignmentMode.mutate(event.target.value)}
              disabled={updateAssignmentMode.isPending}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-slate-600 dark:bg-white/[0.06] dark:text-white"
            >
              <option value="Manual">Manual</option>
              <option value="Automatic">Automatic (9:00 AM daily, random)</option>
            </select>

            <Button
              type="button"
              variant="secondary"
              onClick={() => runAutoAssignNow.mutate()}
              isLoading={runAutoAssignNow.isPending}
              title="Randomly assign every currently-unassigned lead to an active CRM employee, right now"
              className="h-10 px-4"
            >
              Run Automatic Assignment Now
            </Button>
          </div>
        </div>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/[0.06]">
        {[
          { id: "leads", label: "Leads" },
          { id: "uploads", label: "Marketing Uploads" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === t.id
                ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "leads" && (
      <>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-slate-600 dark:bg-white/[0.06] dark:text-white"
            />
          </div>

          <div className="w-full sm:max-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-slate-600 dark:bg-white/[0.06] dark:text-white"
            />
          </div>

          <Button
            type="button"
            onClick={() => downloadReport.mutate()}
            isLoading={downloadReport.isPending}
            className="h-10 px-4"
          >
            Download Excel
          </Button>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Leave both dates empty to preview/export every lead on record. The table below always
          matches what Download Excel will produce for the selected range.
        </p>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <div className="w-full sm:max-w-sm">
            <TableSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search name, contact, email or source..."
            />
          </div>
        </div>

        {isError ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-500/10 dark:text-red-400">
            Failed to load leads.
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredLeads}
            loading={isLoading}
            emptyText="No leads match your current search or date range."
          />
        )}

        <div className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-400 dark:border-white/10">
          Showing {filteredLeads.length} of {allLeads.length} leads
        </div>
      </div>
      </>
      )}

      {tab === "uploads" && (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          {uploadsError ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-500/10 dark:text-red-400">
              Failed to load marketing uploads.
            </div>
          ) : uploadsLoading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
          ) : uploadBatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No lead uploads from CRM Marketing employees yet.
            </div>
          ) : (
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="tbl-head border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Marketing Executive</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Contact Number</th>
                  <th className="px-4 py-3 font-medium">No. of Leads</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">File Name</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {uploadBatches.map((batch) => {
                  const employee = batch.uploader_employee;
                  const isDownloadingThis =
                    downloadUploadReport.isPending && downloadUploadReport.variables === batch.id;
                  return (
                    <tr key={batch.id} className="tbl-row">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatDateTime(batch.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {getExecutiveName(employee)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {employee?.employee_code || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {employee?.phone || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {batch.lead_count ?? batch.success_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {batch.location || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {batch.source || "-"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-600 dark:text-slate-300">
                        {batch.file_name}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openBatchPreview(batch)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-600 transition hover:bg-primary-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-primary-400 dark:hover:bg-primary-500/10"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadUploadReport.mutate(batch.id)}
                            disabled={isDownloadingThis}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            {isDownloadingThis ? "Downloading..." : "Download Excel"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-400 dark:border-white/10">
            Showing {uploadBatches.length} upload(s)
          </div>
        </div>
      )}

      <LeadDetailsModal lead={selectedLead} onClose={() => setSelectedLead(null)} />

      {previewBatch && (
        <Modal
          open={!!previewBatch}
          onClose={closeBatchPreview}
          title={`Preview — ${previewBatch.file_name}`}
          size="lg"
        >
          {previewLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading leads...</div>
          ) : previewLeads?.length ? (
            <div className="max-h-[60vh] overflow-y-auto overflow-x-auto rounded-lg border border-slate-100 dark:border-white/10">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Customer Name</th>
                    <th className="px-3 py-2 font-semibold">Mobile Number</th>
                    <th className="px-3 py-2 font-semibold">Groom For Whom</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {previewLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100">
                        {lead.lead_name}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                        {lead.contact_number || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                        {lead.groom_for_whom || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                        {lead.location || "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge className="bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {lead.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              No leads found for this upload.
            </p>
          )}

          {previewLeads?.length > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => downloadUploadReport.mutate(previewBatch.id)}
                disabled={downloadUploadReport.isPending}
                className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
              >
                {downloadUploadReport.isPending ? "Downloading..." : "Download Excel"}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
