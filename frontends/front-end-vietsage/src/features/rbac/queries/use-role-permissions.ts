"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rolePermissionsResource } from "../resources/role-permissions-resource";
import type { RolePermission } from "../repositories/role-permissions-repository";

const resource = rolePermissionsResource.bind({});

export function useRolePermissions(roleId: string | null, initialPermissions: Record<string, RolePermission[]>) {
  const client = useQueryClient();
  const permissions = useQuery({
    ...resource.queries.permissions.options(roleId ?? ""),
    enabled: Boolean(roleId),
    initialData: roleId ? initialPermissions[roleId] : undefined,
  });
  const create = useMutation(resource.mutations.create.options());
  const update = useMutation(resource.mutations.update.options());
  const remove = useMutation(resource.mutations.remove.options());
  const load = useCallback(async (id: string): Promise<RolePermission[]> => {
    try {
      return await client.fetchQuery({
        ...resource.queries.permissions.options(id),
        initialData: initialPermissions[id],
      });
    } catch {
      // Modal callers keep the existing empty fallback; query state retains the error.
      return [];
    }
  }, [client, initialPermissions]);

  return {
    permissions, load, create, update, remove,
    set: (id: string, data: RolePermission[]) => resource.queries.permissions.set(client, id, data),
    removeCached: (id: string) => resource.queries.permissions.remove(client, id),
  };
}
