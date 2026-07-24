import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@/libs/query-resource";

import {
  staffDirectoryRepository,
  type AssignStaffRoleInput,
  type StaffDirectoryListInput,
  type StaffManagementScope,
  type UpdateStaffAssignmentInput,
} from "@/features/staff-management/repositories/staff-directory-repository";
import type {
  CreateAssignedHotelStaffUserInput,
  StaffDirectorySnapshot,
} from "@/features/staff-management/types/staff-management-contract";

const INVALIDATE_DIRECTORY = [
  { type: "query", operation: "directory" },
] as const;

async function listStaffDirectory({
  scope,
  input,
  signal,
}: ResourceQueryContext<
  StaffManagementScope,
  StaffDirectoryListInput
>): Promise<StaffDirectorySnapshot> {
  return staffDirectoryRepository.list(scope, input, { signal });
}

async function createStaffUser({
  scope,
  variables,
}: ResourceMutationContext<
  StaffManagementScope,
  CreateAssignedHotelStaffUserInput
>): Promise<unknown> {
  return staffDirectoryRepository.createUser(scope, variables);
}

async function assignStaffRole({
  scope,
  variables,
}: ResourceMutationContext<
  StaffManagementScope,
  AssignStaffRoleInput
>): Promise<unknown> {
  return staffDirectoryRepository.assignRole(scope, variables);
}

async function revokeStaffRole({
  scope,
  variables,
}: ResourceMutationContext<
  StaffManagementScope,
  AssignStaffRoleInput
>): Promise<unknown> {
  return staffDirectoryRepository.revokeRole(scope, variables);
}

async function updateStaffAssignment({
  scope,
  variables,
}: ResourceMutationContext<
  StaffManagementScope,
  UpdateStaffAssignmentInput
>): Promise<unknown> {
  return staffDirectoryRepository.updateAssignment(scope, variables);
}

export const staffDirectoryResource =
  createResource<StaffManagementScope>()({
    namespace: ["vietsage"],
    name: "staff-directory",
    scopeKey: (scope) => [
      "surface",
      scope.surface,
      "tenant",
      scope.tenantId ?? null,
      "hotel",
      scope.hotelId ?? null,
    ],
    queries: {
      directory: defineQuery({
        inputKey: (input: StaffDirectoryListInput) => [
          {
            q: input.q ?? "",
            page: input.page,
            limit: input.limit,
          },
        ],
        queryFn: listStaffDirectory,
      }),
    },
    mutations: {
      createUser: defineMutation({
        mutationFn: createStaffUser,
        invalidates: INVALIDATE_DIRECTORY,
      }),
      assignRole: defineMutation({
        mutationFn: assignStaffRole,
        invalidates: INVALIDATE_DIRECTORY,
      }),
      revokeRole: defineMutation({
        mutationFn: revokeStaffRole,
        invalidates: INVALIDATE_DIRECTORY,
      }),
      updateAssignment: defineMutation({
        mutationFn: updateStaffAssignment,
        invalidates: INVALIDATE_DIRECTORY,
      }),
    },
  });
