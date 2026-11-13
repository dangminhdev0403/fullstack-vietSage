export type DashboardNavSection =
  | "OVERVIEW"
  | "OPERATIONS"
  | "ADMINISTRATION"
  | "PARTNERS";

export type DashboardNavSubItem = {
  key: string;
  label: string;
  href: `/${string}`;
  icon?: string;
  tabValue: string;
  paramName?: string;
  isDefault?: boolean;
};

export type DashboardNavItem = {
  key: string;
  label: string;
  href: `/${string}`;
  icon: string;
  section?: DashboardNavSection;
  children?: readonly DashboardNavSubItem[];
};


