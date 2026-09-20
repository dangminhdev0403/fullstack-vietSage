import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  staffDirectoryRepository,
  type AssignStaffRoleInput,
  type AssignStaffRoomInput,
  type StaffDirectoryListInput,
  type StaffManagementScope,
  type UnassignStaffRoomInput,
  type UpdateStaffAssignmentInput,
  type UpdateStaffUserInput,
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

async function updateStaffAssignment({
  scope,
  variables,
}: ResourceMutationContext<
  StaffManagementScope,
  UpdateStaffAssignmentInput
>): Promise<unknown> {
  return staffDirectoryRepository.updateAssignment(scope, variables);
}
async function updateStaffUser({ scope, variables }: ResourceMutationContext<StaffManagementScope, UpdateStaffUserInput>): Promise<unknown> { return staffDirectoryRepository.updateUser(scope, variables); }

async function resetFrontdeskPassword({
  scope,
  variables,
}: ResourceMutationContext<StaffManagementScope, { userId: string }>) {
  return staffDirectoryRepository.resetFrontdeskPassword(scope, variables.userId);
}

async function assignStaffRoom({
  scope,
  variables,
}: ResourceMutationContext<StaffManagementScope, AssignStaffRoomInput>) {
  return staffDirectoryRepository.assignRoom(scope, variables);
}

async function unassignStaffRoom({
  scope,
  variables,
}: ResourceMutationContext<StaffManagementScope, UnassignStaffRoomInput>) {
  return staffDirectoryRepository.unassignRoom(scope, variables);
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
      updateAssignment: defineMutation({
        mutationFn: updateStaffAssignment,
        invalidates: INVALIDATE_DIRECTORY,
      }),
      updateUser: defineMutation({ mutationFn: updateStaffUser, invalidates: INVALIDATE_DIRECTORY }),
      resetFrontdeskPassword: defineMutation({
        mutationFn: resetFrontdeskPassword,
      }),
      assignRoom: defineMutation({
        mutationFn: assignStaffRoom,
        invalidates: INVALIDATE_DIRECTORY,
      }),
      unassignRoom: defineMutation({
        mutationFn: unassignStaffRoom,
        invalidates: INVALIDATE_DIRECTORY,
      }),
    },
  });
