import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

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

  const { data, isLoading, isError } = useLeads({ page: 1, per_page: 1000 });
  const allLeads = data?.items || [];

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

      <LeadDetailsModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
