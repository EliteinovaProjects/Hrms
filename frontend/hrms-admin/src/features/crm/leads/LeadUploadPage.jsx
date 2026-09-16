import { useCallback, useMemo, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import TableToolbar from "@/components/table/TableToolbar";

import { useToast } from "@/components/feedback/Toast";

import ConfirmDialog from "@/components/feedback/ConfirmDialog";

import {
  useLeadUploads,
  useUploadLeads,
  useUploadLeadPhoto,
  useDeleteLeadUploadPermanently,
} from "./useLeadUpload";

import { useCRMEmployeeOptions } from "@/hooks/useLookupOptions";
import { useFileDownload } from "@/hooks/useFileDownload";
import { getUser } from "@/utils/tokenHelpers";
import { crmApi } from "@/api/crm.api";

/* =========================================================
   CONSTANTS
========================================================= */

const CARD_PAGE_SIZE = 6;
const TABLE_PAGE_SIZE = 10;

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg"];

const STATUS_BADGE_CLASS = {
  Processing: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  Completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  "Completed with errors": "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

/* =========================================================
   HELPERS
========================================================= */

function getStatusBadgeClass(status) {
  return STATUS_BADGE_CLASS[status] || STATUS_BADGE_CLASS.Processing;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name) {
  if (!name) return "?";
  return name[0]?.toUpperCase() || "?";
}

// OCR.space's free tier caps uploads at 1MB — phone camera photos are
// routinely 3-8MB, so every lead photo is downscaled/re-compressed
// client-side (via <canvas>, no extra dependency) before it's ever sent
// anywhere. Re-encodes as JPEG, capping the longest edge at 1600px, then
// steps quality down until the result fits comfortably under the limit.
const MAX_PHOTO_DIMENSION = 1600;
const MAX_PHOTO_BYTES = 900 * 1024; // stay safely under OCR.space's 1MB cap

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image"));
    image.src = src;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

async function compressImageFile(file) {
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);

    let { width, height } = image;
    if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
      const scale = MAX_PHOTO_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    let quality = 0.9;
    let blob = await canvasToBlob(canvas, "image/jpeg", quality);

    while (blob && blob.size > MAX_PHOTO_BYTES && quality > 0.3) {
      quality -= 0.15;
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }

    if (!blob || blob.size >= file.size) {
      // Compression didn't actually help (e.g. already a tiny image) —
      // keep the original rather than risk a worse/garbled result.
      return file;
    }

    const compressedName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], compressedName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // If anything about compression fails, fall back to the original file
    // — the upload can still proceed, OCR.space will just reject it if
    // it's genuinely over the size limit.
    return file;
  }
}

/* =========================================================
   ICONS
========================================================= */

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
);

const BatchStatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8h6m-6 4h6" />
  </svg>
);

const SuccessStatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const FailedStatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364L18.364 5.636" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-6 4h4m1-15H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 001 1h4" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.4">
    <rect x="3" y="4" width="14" height="13" rx="1.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2.5v3M13.5 2.5v3M3 8h14" />
  </svg>
);

const UserSmallIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.4">
    <circle cx="10" cy="7" r="3" />
    <path strokeLinecap="round" d="M3.5 17c1-3.3 4-5 6.5-5s5.5 1.7 6.5 5" />
  </svg>
);

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({ icon, value, label, tone = "sky" }) {
  const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-5 shadow-sm dark:border-white/10 dark:from-primary-500/[0.06] dark:to-white/[0.02]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   HOVER TRIGGER + DETAILS CARD
========================================================= */

function HoverDetailsTrigger({ children, panel, align = "left" }) {
  const alignClasses = {
    left: "left-0",
    center: "left-1/2 -translate-x-1/2",
    right: "right-0",
  };

  return (
    <div tabIndex={0} className="group/batch-details relative inline-flex max-w-full outline-none">
      <div className="max-w-full">{children}</div>
      <div
        className={`
          pointer-events-none invisible absolute top-full z-[100] mt-2 opacity-0 transition-all duration-150
          group-hover/batch-details:pointer-events-auto group-hover/batch-details:visible group-hover/batch-details:opacity-100
          group-focus/batch-details:pointer-events-auto group-focus/batch-details:visible group-focus/batch-details:opacity-100
          ${alignClasses[align]}
        `}
      >
        {panel}
      </div>
    </div>
  );
}

function BatchDetailsCard({ batch }) {
  return (
    <div className="w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-slate-200 border-t-2 border-t-primary-500 bg-white p-4 text-left shadow-xl dark:border-white/10 dark:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Batch Details
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-white">
            {batch?.file_name}
          </p>
        </div>
        <Badge className={getStatusBadgeClass(batch?.status)}>{batch?.status}</Badge>
      </div>

      <div className="my-3 border-t border-slate-100 dark:border-white/10" />

      <div className="space-y-2.5">
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
          <span className="text-xs text-slate-400">Uploaded By</span>
          <span className="text-right text-xs font-medium text-slate-700 dark:text-slate-200">
            {batch?.uploader?.username || "—"}
          </span>
        </div>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
          <span className="text-xs text-slate-400">Total Rows</span>
          <span className="text-right text-xs font-medium text-slate-700 dark:text-slate-200">
            {batch?.total_rows}
          </span>
        </div>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
          <span className="text-xs text-slate-400">Success</span>
          <span className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {batch?.success_count}
          </span>
        </div>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
          <span className="text-xs text-slate-400">Failed</span>
          <span className="text-right text-xs font-semibold text-red-500 dark:text-red-400">
            {batch?.failed_count}
          </span>
        </div>
      </div>

      {batch?.error_summary && (
        <>
          <div className="my-3 border-t border-slate-100 dark:border-white/10" />
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Error Summary
            </p>
            <p className="break-words text-xs leading-5 text-slate-700 dark:text-slate-200">
              {batch.error_summary}
            </p>
          </div>
        </>
      )}

      <div className="my-3 border-t border-slate-100 dark:border-white/10" />

      <div>
        <p className="text-[10px] text-slate-400">Uploaded At</p>
        <p className="mt-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200">
          {formatDateTime(batch?.created_at)}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function LeadUploadPage() {
  const { showToast } = useToast();
  const { downloadBlob } = useFileDownload();
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // A CRM Marketing employee login (role "employee") can only ever assign
  // leads to themselves — the backend enforces this too (upload_leads /
  // upload_lead_photo override whatever assigned_to is submitted for a
  // non-admin caller), so the dropdown is locked to just their own name
  // instead of showing the whole CRM directory. Admin logins keep the
  // full picker with no default, since admin uploads on behalf of
  // whichever employee they choose each time.
  const currentUser = getUser();
  const isEmployeeLogin = currentUser?.role === "employee";
  const ownEmployeeId = isEmployeeLogin ? currentUser?.employee?.id : "";
  const defaultAssignee = ownEmployeeId ? String(ownEmployeeId) : "";
  const ownEmployeeLabel = isEmployeeLogin
    ? [currentUser?.employee?.first_name, currentUser?.employee?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      currentUser?.employee?.employee_code ||
      `Employee #${ownEmployeeId}`
    : "";

  const [selectedFile, setSelectedFile] = useState(null);
  const [assignedTo, setAssignedTo] = useState(defaultAssignee);
  const [isDragging, setIsDragging] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoAssignedTo, setPhotoAssignedTo] = useState(defaultAssignee);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [lastExtraction, setLastExtraction] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("active");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [page, setPage] = useState(1);

  // Batch "preview" — shows what a batch actually produced (its extracted
  // leads), opened via the eye icon next to each upload row.
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

  const {
    data: allData,
    isLoading,
    isFetching,
    refetch,
  } = useLeadUploads({ page: 1, per_page: 1000 });

  const batches = allData?.items || [];

  const uploadLeads = useUploadLeads();
  const uploadLeadPhoto = useUploadLeadPhoto();
  const deleteLeadUploadPermanently = useDeleteLeadUploadPermanently();
  const crmEmployeeOptions = useCRMEmployeeOptions();
  // Locked to just "self" for a CRM Marketing employee login — see note
  // above ownEmployeeId/defaultAssignee.
  const assigneeOptions = isEmployeeLogin
    ? [{ value: ownEmployeeId, label: ownEmployeeLabel }]
    : crmEmployeeOptions;

  /* -------------------------------------------------------
     DERIVED
  ------------------------------------------------------- */

  const totalSuccess = useMemo(
    () => batches.reduce((sum, b) => sum + (b.success_count || 0), 0),
    [batches]
  );
  const totalFailed = useMemo(
    () => batches.reduce((sum, b) => sum + (b.failed_count || 0), 0),
    [batches]
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return batches.filter((batch) => {
      const isActive = batch.is_active !== false;

      if (activeFilter === "active" && !isActive) return false;
      if (activeFilter === "inactive" && isActive) return false;

      if (statusFilter && batch.status !== statusFilter) return false;

      if (normalizedSearch) {
        const haystack = [batch.file_name, batch.uploader?.username].join(" ").toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [batches, search, statusFilter, activeFilter]);

  const sorted = useMemo(
    () => filtered.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [filtered]
  );

  const pageSize = viewMode === "card" ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  /* -------------------------------------------------------
     FILE HANDLING
  ------------------------------------------------------- */

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".xlsx")) {
      setSelectedFile(file);
    }
  }, []);

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast("Please choose a file to upload", "error");
      return;
    }

    try {
      const result = await uploadLeads.mutateAsync({
        file: selectedFile,
        assignedTo: assignedTo || undefined,
      });

      showToast(`Uploaded: ${result?.data?.data?.success_count ?? 0} leads created`, "success");

      clearSelectedFile();
      setAssignedTo(defaultAssignee);
    } catch (error) {
      showToast(error?.response?.data?.message || error?.message || "Upload failed", "error");
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await crmApi.leadUploads.template();
      downloadBlob(res, "lead_upload_template.xlsx");
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.message || "Failed to download the template",
        "error"
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0] || null;

    if (file && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast("Only .png, .jpg or .jpeg image files are supported", "error");
      event.target.value = "";
      return;
    }

    setLastExtraction(null);

    if (!file) {
      setSelectedPhoto(null);
      setPhotoPreview(null);
      return;
    }

    // Phone camera photos routinely land at 3-8MB; OCR.space's free tier
    // caps uploads at 1MB, so every photo is downscaled/re-compressed
    // client-side before it's stored as the selected file.
    setCompressingPhoto(true);
    try {
      const processedFile = await compressImageFile(file);
      setSelectedPhoto(processedFile);
      setPhotoPreview(URL.createObjectURL(processedFile));
    } finally {
      setCompressingPhoto(false);
    }
  };

  const clearSelectedPhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setPhotoPreviewOpen(false);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const [downloadingReport, setDownloadingReport] = useState(false);

  const handlePhotoUpload = async () => {
    if (!selectedPhoto) {
      showToast("Please choose a lead photo to upload", "error");
      return;
    }

    try {
      const result = await uploadLeadPhoto.mutateAsync({
        file: selectedPhoto,
        assignedTo: photoAssignedTo || undefined,
      });

      const extracted = result?.data?.data;
      setLastExtraction(extracted || null);

      const leads = extracted?.leads || [];
      showToast(
        leads.length > 1
          ? `${leads.length} leads extracted from the photo`
          : `Lead extracted: ${leads[0]?.lead_name || "unnamed"}${
              leads[0]?.contact_number ? ` · ${leads[0].contact_number}` : ""
            }`,
        "success"
      );

      clearSelectedPhoto();
      setPhotoAssignedTo(defaultAssignee);
    } catch (error) {
      const extracted = error?.response?.data?.data;
      if (extracted?.raw_text) {
        setLastExtraction(extracted);
      }
      showToast(
        error?.response?.data?.message || error?.message || "Photo upload failed",
        "error"
      );
    }
  };

  const handleDownloadBatchReport = async (batchId) => {
    setDownloadingReport(true);
    try {
      const res = await crmApi.leadUploads.report(batchId);
      downloadBlob(res, `lead_upload_${batchId}.xlsx`);
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.message || "Failed to download the report",
        "error"
      );
    } finally {
      setDownloadingReport(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setActiveFilter("active");
    setPage(1);
  };

  const confirmDeletePermanently = async () => {
    if (!deleteTarget?.id) return;

    try {
      await deleteLeadUploadPermanently.mutateAsync(deleteTarget.id);
      showToast("Upload batch and its leads permanently deleted", "success");
      setDeleteTarget(null);
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.message || "Failed to delete the batch",
        "error"
      );
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      {/* HEADER */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
            <UploadIcon />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Lead Upload
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Bulk import leads from an Excel file
            </p>
          </div>
        </div>

        <TableToolbar onRefresh={refetch} refreshing={isFetching} />
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<BatchStatIcon />} value={batches.length} label="Total Batches" tone="sky" />
        <StatCard icon={<SuccessStatIcon />} value={totalSuccess} label="Leads Created" tone="emerald" />
        <StatCard icon={<FailedStatIcon />} value={totalFailed} label="Rows Failed" tone="red" />
      </div>

      {/* UPLOAD PANEL */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-5 shadow-sm dark:border-white/10 dark:from-primary-500/[0.06] dark:to-white/[0.02]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          {/* Dropzone */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Excel File (.xlsx)
            </label>

            {selectedFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3 dark:border-primary-500/30 dark:bg-primary-500/10">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary-600 dark:bg-white/[0.06] dark:text-primary-400">
                  <FileIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  title="Remove file"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors ${
                  isDragging
                    ? "border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-500/10"
                    : "border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-white/[0.06]/60 dark:hover:bg-slate-800"
                }`}
              >
                <UploadIcon />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-primary-600 dark:text-primary-400">Choose a file</span> or drag it here
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Assignee + action */}
          <div className="flex flex-col justify-between gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                {isEmployeeLogin ? "Assigned To" : "Default Assignee (optional)"}
              </label>
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                disabled={isEmployeeLogin}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-600 dark:bg-white/[0.06] dark:text-white dark:disabled:bg-white/[0.03]"
              >
                {!isEmployeeLogin && <option value="">No default assignee</option>}
                {assigneeOptions.map((employee) => (
                  <option key={employee.value} value={employee.value}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              onClick={handleUpload}
              disabled={uploadLeads.isPending || !selectedFile}
              className="h-10 w-full px-4"
            >
              {uploadLeads.isPending ? "Uploading..." : "Upload Leads"}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">
            Expected columns (row 1 = header): lead_name, contact_number, email, source, status
          </p>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={downloadingTemplate}
            className="text-[11px] font-semibold text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
          >
            {downloadingTemplate ? "Downloading..." : "Download Excel Template"}
          </button>
        </div>
      </div>

      {/* PHOTO / OCR UPLOAD PANEL */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-5 shadow-sm dark:border-white/10 dark:from-primary-500/[0.06] dark:to-white/[0.02]">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white">
            Lead Photo (auto-extract)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Upload a photo of handwritten/typed lead notes from your gallery — every row (name,
            mobile number, and optionally who it's for and their location) is extracted
            automatically into its own lead. Supported formats: PNG, JPG, JPEG. Large photos are
            compressed automatically before upload.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Lead Photo
            </label>

            {compressingPhoto ? (
              <div className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-center dark:border-slate-600 dark:bg-white/[0.06]/60">
                <p className="text-xs text-slate-500 dark:text-slate-400">Compressing photo...</p>
              </div>
            ) : selectedPhoto ? (
              <div className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3 dark:border-primary-500/30 dark:bg-primary-500/10">
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => setPhotoPreviewOpen(true)}
                    className="shrink-0"
                    title="Preview photo"
                  >
                    <img
                      src={photoPreview}
                      alt="Lead preview"
                      className="h-14 w-14 rounded-lg object-cover ring-1 ring-primary-200 transition hover:opacity-90 dark:ring-primary-500/30"
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {selectedPhoto.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatFileSize(selectedPhoto.size)}
                  </p>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => setPhotoPreviewOpen(true)}
                      className="mt-0.5 text-[11px] font-semibold text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Preview
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearSelectedPhoto}
                  title="Remove photo"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-center transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-white/[0.06]/60 dark:hover:bg-slate-800">
                <UploadIcon />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-primary-600 dark:text-primary-400">
                    Choose a photo
                  </span>{" "}
                  from your gallery
                </p>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex flex-col justify-between gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                {isEmployeeLogin ? "Assigned To" : "Assign To (optional)"}
              </label>
              <select
                value={photoAssignedTo}
                onChange={(event) => setPhotoAssignedTo(event.target.value)}
                disabled={isEmployeeLogin}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-600 dark:bg-white/[0.06] dark:text-white dark:disabled:bg-white/[0.03]"
              >
                {!isEmployeeLogin && <option value="">No default assignee</option>}
                {assigneeOptions.map((employee) => (
                  <option key={employee.value} value={employee.value}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              onClick={handlePhotoUpload}
              disabled={uploadLeadPhoto.isPending || compressingPhoto || !selectedPhoto}
              className="h-10 w-full px-4"
            >
              {uploadLeadPhoto.isPending ? "Extracting..." : "Upload & Extract"}
            </Button>
          </div>
        </div>

        {lastExtraction && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Extracted Details {lastExtraction.leads?.length ? `(${lastExtraction.leads.length})` : ""}
              </p>
              {!isEmployeeLogin && lastExtraction.batch?.id && lastExtraction.leads?.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDownloadBatchReport(lastExtraction.batch.id)}
                  disabled={downloadingReport}
                  className="text-[11px] font-semibold text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
                >
                  {downloadingReport ? "Downloading..." : "Download Excel"}
                </button>
              )}
            </div>

            {lastExtraction.leads?.length > 0 ? (
              <div className="mt-2 overflow-x-auto rounded-md border border-slate-100 dark:border-white/10">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400 dark:bg-white/[0.06]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Customer Name</th>
                      <th className="px-3 py-2 font-semibold">Mobile Number</th>
                      <th className="px-3 py-2 font-semibold">Groom For Whom</th>
                      <th className="px-3 py-2 font-semibold">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {lastExtraction.leads.map((lead) => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
                  Saved as Leads. Edit any row from the Leads screen if something was misread.
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                Couldn't confidently extract any leads — nothing was saved. Raw text read from the
                image is shown below; add the lead(s) manually if needed.
              </p>
            )}

            {lastExtraction.raw_text && (
              <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                {lastExtraction.raw_text}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* FILTERS */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap">
            <div className="relative w-full sm:max-w-xs">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m2.35-5.65a8 8 0 11-16 0 8 8 0 0116 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by file name or uploader..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-slate-600 dark:bg-white/[0.06] dark:text-white"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:max-w-[200px] dark:border-slate-600 dark:bg-white/[0.06] dark:text-white"
            >
              <option value="">All Statuses</option>
              <option value="Processing">Processing</option>
              <option value="Completed">Completed</option>
              <option value="Completed with errors">Completed with errors</option>
            </select>

            {(search || statusFilter || activeFilter !== "active") && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-white/[0.06] dark:text-slate-300"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center rounded-lg bg-slate-100 p-1 dark:bg-white/[0.06]">
              {["active", "inactive", "all"].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setActiveFilter(status);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                    activeFilter === status
                      ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="flex items-center rounded-lg bg-slate-100 p-1 dark:bg-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setViewMode("table");
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  viewMode === "table"
                    ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("card");
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  viewMode === "card"
                    ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                Card
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DATA */}
      {isLoading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
      ) : paged.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white">No upload batches found</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            No records match your current search or filters. Upload a file above to get started.
          </p>
        </div>
      ) : viewMode === "table" ? (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <table className="w-full text-left text-sm">
            <thead className="tbl-head border-b border-slate-200 dark:border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Uploaded By</th>
                <th className="px-4 py-3 font-medium">Total Rows</th>
                <th className="px-4 py-3 font-medium">Success</th>
                <th className="px-4 py-3 font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Uploaded At</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.map((batch) => (
                <tr key={batch.id} className="tbl-row">
                  <td className="px-4 py-3">
                    <HoverDetailsTrigger align="left" panel={<BatchDetailsCard batch={batch} />}>
                      <div className="flex cursor-pointer items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                          <FileIcon />
                        </div>
                        <span className="max-w-[220px] truncate font-medium text-slate-800 dark:text-slate-100">
                          {batch.file_name}
                        </span>
                      </div>
                    </HoverDetailsTrigger>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {batch.uploader?.username || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{batch.total_rows}</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">{batch.success_count}</td>
                  <td className="px-4 py-3 text-red-500 dark:text-red-400">{batch.failed_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={getStatusBadgeClass(batch.status)}>{batch.status}</Badge>
                      {batch.is_active === false && (
                        <Badge className="bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
                          Removed
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {formatDateTime(batch.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Preview extracted leads"
                        onClick={() => openBatchPreview(batch)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        <EyeIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(batch)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paged.map((batch) => (
            <div
              key={batch.id}
              className="flex min-w-0 flex-col overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                    <FileIcon />
                  </div>
                  <div className="min-w-0">
                    <HoverDetailsTrigger align="left" panel={<BatchDetailsCard batch={batch} />}>
                      <p className="max-w-[180px] cursor-pointer truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {batch.file_name}
                      </p>
                    </HoverDetailsTrigger>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                      <UserSmallIcon />
                      {batch.uploader?.username || "Unknown"}
                    </div>
                  </div>
                </div>

                <Badge className={getStatusBadgeClass(batch.status)}>{batch.status}</Badge>
              </div>

              <div className="my-3 border-t border-slate-100 dark:border-slate-800" />

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-white/[0.06]/60">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{batch.total_rows}</p>
                  <p className="text-[9px] text-slate-400">Total</p>
                </div>
                <div className="rounded-lg bg-emerald-50 py-2 dark:bg-emerald-500/10">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{batch.success_count}</p>
                  <p className="text-[9px] text-emerald-600 dark:text-emerald-400">Success</p>
                </div>
                <div className="rounded-lg bg-red-50 py-2 dark:bg-red-500/10">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">{batch.failed_count}</p>
                  <p className="text-[9px] text-red-500 dark:text-red-400">Failed</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <CalendarIcon />
                  {formatDateTime(batch.created_at)}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Preview extracted leads"
                    onClick={() => openBatchPreview(batch)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    <EyeIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(batch)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PAGINATION */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
        <span>
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06]"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06]"
          >
            Next
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeletePermanently}
        title="Delete Permanently"
        message={
          deleteTarget
            ? `Do you want to delete "${deleteTarget.file_name}" permanently? This removes the upload and all ${deleteTarget.success_count || 0} lead(s) it created — this cannot be undone.`
            : ""
        }
        confirmText="Yes, Delete"
        loading={deleteLeadUploadPermanently.isPending}
      />

      {photoPreviewOpen && photoPreview && (
        <Modal
          open={photoPreviewOpen}
          onClose={() => setPhotoPreviewOpen(false)}
          title="Lead Photo Preview"
          size="lg"
        >
          <img
            src={photoPreview}
            alt="Lead photo preview"
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        </Modal>
      )}

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

          {!isEmployeeLogin && previewLeads?.length > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => handleDownloadBatchReport(previewBatch.id)}
                disabled={downloadingReport}
                className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
              >
                {downloadingReport ? "Downloading..." : "Download Excel"}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}