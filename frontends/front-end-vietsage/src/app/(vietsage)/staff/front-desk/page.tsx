import { StaffWorkspacePage } from "../page";

type FrontDeskDashboardPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default function FrontDeskDashboardPage(props: FrontDeskDashboardPageProps) {
  return <StaffWorkspacePage {...props} expectedPersonas={["front_desk"]} />;
}
