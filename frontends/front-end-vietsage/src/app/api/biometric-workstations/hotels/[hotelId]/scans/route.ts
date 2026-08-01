import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";
export const dynamic="force-dynamic";type Context={params:Promise<{hotelId:string}>|{hotelId:string}};
export async function POST(_request:Request,context:Context){const headers={"Cache-Control":"no-store, private"};const {hotelId}=await Promise.resolve(context.params);const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Unauthorized"},{status:401,headers});try{const denied=await authorizeHotelWorkstation(session,hotelId);if(denied)return denied;if(!workstationStore.hasOnlineWorkstation(hotelId))return NextResponse.json({error:"Máy quét CCCD chưa kết nối"},{status:409,headers});return NextResponse.json(workstationStore.requestScan(hotelId,session.user.id),{status:201,headers})}catch{return NextResponse.json({error:"Không có quyền quét CCCD"},{status:403,headers})}}
