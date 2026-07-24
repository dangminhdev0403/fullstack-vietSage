"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { StaffManagementScope } from "@/features/staff-management/repositories/staff-directory-repository";
import { staffDirectoryResource } from "@/features/staff-management/resources/staff-directory-resource";

export type { StaffManagementScope };

type StaffDirectoryQueryParams = {
  q?: string;
  page?: number;
  limit?: number;
};

function normalizeQuery(
  queryOptions?: StaffDirectoryQueryParams,
) {
  const q = queryOptions?.q?.trim();
  return {
    q: q || undefined,
    page: queryOptions?.page ?? 1,
    limit: queryOptions?.limit ?? 20,
  };
}

export function useStaffDirectoryQuery(scope: StaffManagementScope, queryOptions?: StaffDirectoryQueryParams) {
  const enabled = Boolean(scope.tenantId);
  const staffDirectory = staffDirectoryResource.bind(scope);
  return useQuery({
    ...staffDirectory.queries.directory.options(
      normalizeQuery(queryOptions),
    ),
    enabled,
  });
}

export function useStaffManagementMutations(scope: StaffManagementScope) {
  const staffDirectory = staffDirectoryResource.bind(scope);
  const createUser = useMutation(
    staffDirectory.mutations.createUser.options(),
  );
  const assignRole = useMutation(
    staffDirectory.mutations.assignRole.options(),
  );
  const revokeRole = useMutation(
    staffDirectory.mutations.revokeRole.options(),
  );
  const updateAssignment = useMutation(
    staffDirectory.mutations.updateAssignment.options(),
  );

  return { createUser, assignRole, revokeRole, updateAssignment };
}
