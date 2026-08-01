import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { workstationStore } from "@/features/local-biometric/workstation/workstation-store";
import { authorizeHotelWorkstation } from "@/features/local-biometric/workstation/authorize-hotel-workstation";
export const dynamic="force-dynamic";type Context={params:Promise<{scanRequestId:string}>|{scanRequestId:string}};
export async function GET(request:Request,context:Context){const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Unauthorized"},{status:401,headers:{"Cache-Control":"no-store, private"}});const hotelId=new URL(request.url).searchParams.get("hotelId")??"";const denied=await authorizeHotelWorkstation(session,hotelId);if(denied)return denied;const {scanRequestId}=await Promise.resolve(context.params);const scan=workstationStore.readScan(scanRequestId,hotelId,session.user.id);return scan?NextResponse.json(scan,{headers:{"Cache-Control":"no-store, private"}}):NextResponse.json({error:"Lượt quét không tồn tại hoặc đã hết hạn"},{status:404,headers:{"Cache-Control":"no-store, private"}})}
