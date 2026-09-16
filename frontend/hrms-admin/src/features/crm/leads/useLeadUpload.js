import { crmApi } from "@/api/crm.api";

import {
  useCrudList,
  useCrudGet,
} from "@/hooks/useCrudResource";

import { useMutation, useQueryClient } from "@tanstack/react-query";

const api = crmApi.leadUploads;

/* =========================================================
   LIST
========================================================= */

export const useLeadUploads = (params) =>
  useCrudList("lead-uploads", api, params);

/* =========================================================
   GET SINGLE
========================================================= */

export const useLeadUpload = (id) =>
  useCrudGet("lead-uploads", api, id);

/* =========================================================
   UPLOAD
========================================================= */

export function useUploadLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, assignedTo }) =>
      api.upload(file, assignedTo),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-uploads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/* =========================================================
   PHOTO / OCR UPLOAD
========================================================= */

export function useUploadLeadPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, assignedTo }) =>
      api.uploadPhoto(file, assignedTo),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-uploads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/* =========================================================
   DEACTIVATE
========================================================= */

export function useDeactivateLeadUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => api.deactivate(id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-uploads"] });
    },
  });
}

/* =========================================================
   PERMANENT DELETE — removes the batch AND every Lead it created, so
   the batch also disappears from admin's Lead Generation Report.
========================================================= */

export function useDeleteLeadUploadPermanently() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => api.deletePermanently(id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-uploads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}