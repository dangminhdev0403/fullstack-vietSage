"use client";

import { createContext, type ReactNode, useContext } from "react";

type WorkspaceProfile = {
  profileName: string | null;
};

const WorkspaceProfileContext = createContext<WorkspaceProfile>({
  profileName: null,
});

export function WorkspaceProfileProvider({
  children,
  profileName,
}: Readonly<WorkspaceProfile & { children: ReactNode }>) {
  return (
    <WorkspaceProfileContext.Provider value={{ profileName }}>
      {children}
    </WorkspaceProfileContext.Provider>
  );
}

export function useWorkspaceProfile(): WorkspaceProfile {
  return useContext(WorkspaceProfileContext);
}
