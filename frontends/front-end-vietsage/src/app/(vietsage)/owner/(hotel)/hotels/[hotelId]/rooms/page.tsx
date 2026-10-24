import StaffRoomsPage from "@/app/(vietsage)/hotels/[hotelId]/rooms/page";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OwnerRoomsPage({ params, searchParams }: PageProps) {
  return (
    <StaffRoomsPage
      params={params}
      searchParams={searchParams}
      baseRoutePrefix="/owner/hotels"
    />
  );
}
