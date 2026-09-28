"use client";

import { createContext, type ReactNode, useContext } from "react";

type WorkspaceProfile = {
  profileName: string | null;
  roleName?: string | null;
  hotelName?: string | null;
  accessibleHotels?: readonly { id: string; name: string }[];
};

const WorkspaceProfileContext = createContext<WorkspaceProfile>({
  profileName: null,
});

export function WorkspaceProfileProvider({
  children,
  profileName,
  roleName,
  hotelName,
  accessibleHotels,
}: Readonly<WorkspaceProfile & { children: ReactNode }>) {
  return (
    <WorkspaceProfileContext.Provider
      value={{ profileName, roleName, hotelName, accessibleHotels }}
    >
      {children}
    </WorkspaceProfileContext.Provider>
  );
}

export function useWorkspaceProfile(): WorkspaceProfile {
  return useContext(WorkspaceProfileContext);
}
