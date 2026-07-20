import type { DashboardNavItem } from "./workspace-navigation";

export type WorkspacePersona =
  | "platform_admin"
  | "owner"
  | "manager"
  | "front_desk"
  | "housekeeping"
  | "maintenance"
  | "food_beverage"
  | "finance";

export type WorkspaceDefinition = {
  persona: WorkspacePersona;
  eyebrow: string;
  title: string;
  description: string;
  profileLabel: string;
  homePath: `/${string}`;
};

export type WorkspaceNavigationDefinition = Omit<DashboardNavItem, "href"> & {
  personas: readonly WorkspacePersona[];
  href: `/${string}`;
  order: number;
  anyCapabilities?: readonly string[];
  requiresHotel?: boolean;
  hideWhenHotelSelected?: boolean;
  labelByPersona?: Partial<Record<WorkspacePersona, string>>;
};

export type WorkspaceWidgetSize = "compact" | "standard" | "wide";

export type WorkspaceWidgetDefinition = {
  key: string;
  personas: readonly WorkspacePersona[];
  title: string;
  description: string;
  icon: string;
  order: number;
  size: WorkspaceWidgetSize;
  anyCapabilities?: readonly string[];
  href?: `/${string}`;
  requiresHotel?: boolean;
};

export type WorkspaceRegistry = {
  definitions: Readonly<Record<WorkspacePersona, WorkspaceDefinition>>;
  roleAliases: Readonly<Record<string, WorkspacePersona>>;
  navigation: readonly WorkspaceNavigationDefinition[];
  widgets: readonly WorkspaceWidgetDefinition[];
};

export type WorkspaceRegistryExtension = {
  roleAliases?: Readonly<Record<string, WorkspacePersona>>;
  navigation?: readonly WorkspaceNavigationDefinition[];
  widgets?: readonly WorkspaceWidgetDefinition[];
  replaceExisting?: boolean;
};
