import { StaffWorkspacePage } from "../page";

type OperationsDashboardPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default function OperationsDashboardPage(props: OperationsDashboardPageProps) {
  return (
    <StaffWorkspacePage
      {...props}
      expectedPersonas={["housekeeping", "maintenance", "food_beverage", "finance"]}
    />
  );
}
