import { StaffWorkspacePage } from "../page";

type ManagerDashboardPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default function ManagerDashboardPage(props: ManagerDashboardPageProps) {
  return <StaffWorkspacePage {...props} expectedPersonas={["manager"]} />;
}
