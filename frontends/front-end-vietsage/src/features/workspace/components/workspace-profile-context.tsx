"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";
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
  // Synchronously seed the store during the initial render pass so child components
  // can immediately read fresh profile data before the first commit/effect.
  const isInitializedRef = useRef<boolean | null>(null);
  if (isInitializedRef.current == null) {
    isInitializedRef.current = true;
    const current = useWorkspaceProfileStore.getState();
    if (
      current.profileName !== profileName ||
      current.roleName !== roleName ||
      current.hotelName !== hotelName ||
      current.accessibleHotels !== accessibleHotels ||
      current.permissions !== permissions
    ) {
      useWorkspaceProfileStore.setState({
        profileName,
        roleName,
        hotelName,
        accessibleHotels,
        permissions,
      });
    }
  }

  // Keep Zustand store in sync on subsequent prop changes
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
  const storeProfile = useWorkspaceProfileStore(
    useShallow((state) => ({
      profileName: state.profileName,
      roleName: state.roleName,
      hotelName: state.hotelName,
      accessibleHotels: state.accessibleHotels,
      permissions: state.permissions,
    })),
  );
  const contextProfile = useContext(WorkspaceProfileContext);

  // Return Zustand store profile with fallback to React Context if store state is empty
  if (
    !storeProfile.profileName &&
    !storeProfile.roleName &&
    !storeProfile.hotelName &&
    (!storeProfile.accessibleHotels || storeProfile.accessibleHotels.length === 0) &&
    (!storeProfile.permissions || storeProfile.permissions.length === 0) &&
    (contextProfile.profileName || contextProfile.roleName || contextProfile.hotelName)
  ) {
    return contextProfile;
  }

  return storeProfile;
}
