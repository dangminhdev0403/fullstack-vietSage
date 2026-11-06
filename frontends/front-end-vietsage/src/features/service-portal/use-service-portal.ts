"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { servicePortalResource } from "./resource";
type ServicePortalQuery = "data" | "financialSummary" | "settlements";
export function useServicePortal(options?: { settlementStatus?: string; queries?: readonly ServicePortalQuery[] }) {
  const resource = servicePortalResource.bind({});
  const enabled = (query: ServicePortalQuery) => options?.queries === undefined || options.queries.includes(query);
  return {
    data: useQuery({ ...resource.queries.data.options(undefined as never), enabled: enabled("data") }),
    financialSummary: useQuery({ ...resource.queries.financialSummary.options(undefined as never), enabled: enabled("financialSummary") }),
    settlements: useQuery({ ...resource.queries.settlements.options(options?.settlementStatus), enabled: enabled("settlements") }),
    verifyVoucher: useMutation(resource.mutations.verifyVoucher.options()),
    profile: useMutation(resource.mutations.profile.options()),
    create: useMutation(resource.mutations.create.options()),
    update: useMutation(resource.mutations.update.options()),
    transition: useMutation(resource.mutations.transition.options()),
    importPreview: useMutation(resource.mutations.importPreview.options()),
    importCommit: useMutation(resource.mutations.importCommit.options()),
  };
}

