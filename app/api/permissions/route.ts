import { NextRequest, NextResponse } from "next/server";
import {getFga, writeFileRelationship, writePermissions} from "@/app/api/permissions/index"; // OR import { CredentialsMethod, OpenFgaClient } from '@openfga/sdk';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const { data } = await request.json();
    try {
        const fga = getFga();

        if(data.permission){
            await writePermissions(fga, data);
        } else{
            await writeFileRelationship(fga, data);
        }

        return NextResponse.json(
            { status: 200 }
        );
    } catch (error) {
        console.log(data);
        console.error("[Permissions API]", error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 },
        );
    }
}

