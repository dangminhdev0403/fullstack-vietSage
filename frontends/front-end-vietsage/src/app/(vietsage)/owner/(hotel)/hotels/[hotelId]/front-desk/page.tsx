import FrontDeskPage from "@/app/(vietsage)/hotels/[hotelId]/front-desk/page";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OwnerFrontDeskPage({ params, searchParams }: PageProps) {
  return (
    <FrontDeskPage
      params={params}
      searchParams={searchParams}
      baseRoutePrefix="/owner/hotels"
    />
  );
}
