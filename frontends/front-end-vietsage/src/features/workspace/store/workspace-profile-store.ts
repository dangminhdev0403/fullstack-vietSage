import { create } from "zustand";

export type WorkspaceAccessibleHotel = {
  id: string;
  name: string;
  enabledFeatures?: readonly string[];
};

export type WorkspaceProfile = {
  profileName: string | null;
  roleName?: string | null;
  hotelName?: string | null;
  accessibleHotels?: readonly WorkspaceAccessibleHotel[];
  permissions: readonly string[];
};

export type WorkspaceProfileState = WorkspaceProfile & {
  setProfile: (profile: Partial<WorkspaceProfile>) => void;
  resetProfile: () => void;
};

export const initialWorkspaceProfile: WorkspaceProfile = {
  profileName: null,
  roleName: null,
  hotelName: null,
  accessibleHotels: [],
  permissions: [],
};

export const useWorkspaceProfileStore = create<WorkspaceProfileState>()((set) => ({
  ...initialWorkspaceProfile,
  setProfile: (profile) =>
    set((state) => ({
      ...state,
      ...profile,
      permissions: profile.permissions ?? state.permissions ?? [],
    })),
  resetProfile: () => set(initialWorkspaceProfile),
}));
