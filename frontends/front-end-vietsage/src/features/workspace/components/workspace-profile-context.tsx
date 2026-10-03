"use client";

import { createContext, type ReactNode, useContext } from "react";

type WorkspaceProfile = {
  profileName: string | null;
  roleName?: string | null;
  hotelName?: string | null;
  accessibleHotels?: readonly {
    id: string;
    name: string;
    enabledFeatures?: readonly string[];
  }[];
  permissions: readonly string[];
};

const WorkspaceProfileContext = createContext<WorkspaceProfile>({
  profileName: null,
  permissions: [],
});

export function WorkspaceProfileProvider({
  children,
  profileName,
  roleName,
  hotelName,
  accessibleHotels,
  permissions = [],
}: Readonly<
  Omit<WorkspaceProfile, "permissions"> & {
    permissions?: readonly string[];
    children: ReactNode;
  }
>) {
  return (
    <WorkspaceProfileContext.Provider
      value={{
        profileName,
        roleName,
        hotelName,
        accessibleHotels,
        permissions,
      }}
    >
      {children}
    </WorkspaceProfileContext.Provider>
  );
}

export function useWorkspaceProfile(): WorkspaceProfile {
  return useContext(WorkspaceProfileContext);
}
