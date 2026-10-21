"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  type WorkspaceAccessibleHotel,
  type WorkspaceProfile,
  useWorkspaceProfileStore,
} from "../store/workspace-profile-store";

export type { WorkspaceAccessibleHotel, WorkspaceProfile };

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
  // Keep Zustand store in sync on prop changes (runs in effect phase, avoiding render-phase store updates)
  useEffect(() => {
    useWorkspaceProfileStore.getState().setProfile({
      profileName,
      roleName,
      hotelName,
      accessibleHotels,
      permissions,
    });
  }, [profileName, roleName, hotelName, accessibleHotels, permissions]);

  const contextValue = useMemo(
    () => ({
      profileName,
      roleName,
      hotelName,
      accessibleHotels,
      permissions,
    }),
    [profileName, roleName, hotelName, accessibleHotels, permissions],
  );

  return (
    <WorkspaceProfileContext.Provider value={contextValue}>
      {children}
    </WorkspaceProfileContext.Provider>
  );
}

export function useWorkspaceProfile(): WorkspaceProfile {
  const contextProfile = useContext(WorkspaceProfileContext);
  const storeProfile = useWorkspaceProfileStore(
    useShallow((state) => ({
      profileName: state.profileName,
      roleName: state.roleName,
      hotelName: state.hotelName,
      accessibleHotels: state.accessibleHotels,
      permissions: state.permissions,
    })),
  );

  // Return React Context if available from WorkspaceProfileProvider, otherwise fall back to Zustand store
  if (
    contextProfile.profileName ||
    contextProfile.roleName ||
    contextProfile.hotelName ||
    (contextProfile.accessibleHotels && contextProfile.accessibleHotels.length > 0) ||
    (contextProfile.permissions && contextProfile.permissions.length > 0)
  ) {
    return contextProfile;
  }

  return storeProfile;
}
