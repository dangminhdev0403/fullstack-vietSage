export type DashboardNavSection =
  | "OVERVIEW"
  | "OPERATIONS"
  | "ADMINISTRATION"
  | "PARTNERS";

export type DashboardNavItem = {
  key: string;
  label: string;
  href: `/${string}`;
  icon: string;
  section?: DashboardNavSection;
};
