"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { servicePortalResource } from "./resource";
export function useServicePortal() { const resource = servicePortalResource.bind({}); return { data: useQuery(resource.queries.data.options(undefined as never)), profile: useMutation(resource.mutations.profile.options()), create: useMutation(resource.mutations.create.options()), update: useMutation(resource.mutations.update.options()), transition: useMutation(resource.mutations.transition.options()), importPreview: useMutation(resource.mutations.importPreview.options()), importCommit: useMutation(resource.mutations.importCommit.options()) }; }
