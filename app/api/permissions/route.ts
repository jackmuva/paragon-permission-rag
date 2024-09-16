import { NextRequest, NextResponse } from "next/server";
import { CredentialsMethod, OpenFgaClient } from '@openfga/sdk'; // OR import { CredentialsMethod, OpenFgaClient } from '@openfga/sdk';

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

async function writePermissions(fga: OpenFgaClient, data: any){
    const object = data.object;
    const permission = data.permission;

    let objectType = "doc";
    let subject = "user";
    if(object.objectType === "application/vnd.google-apps.folder"){
        objectType = "folder";
        object.objectName = object.objectId;
    }
    if(permission.permissionSubjectType === "group"){
        subject = "group"
    }


    await fga.write({
        writes: [
            {
                "user": subject + ":" + permission.permissionSubject,
                "relation":permission.permissionType,
                "object": objectType + ":" + object.objectId
            }
        ],
    }, {
        authorizationModelId: process.env.FGA_MODEL_ID
    });
}

async function writeFileRelationship(fga: OpenFgaClient, data: any){
    const object = data.object;
    const subject = data.subject;

    await fga.write({
        writes: [
            {
                "user": "folder" + ":" + subject.subjectId,
                "relation":"parent",
                "object": "doc:" + object.objectId
            }
        ],
    }, {
        authorizationModelId: process.env.FGA_MODEL_ID
    });
}

export function getFga(): OpenFgaClient{
    return new OpenFgaClient({
        apiUrl: process.env.FGA_API_URL,
        storeId: process.env.FGA_STORE_ID,
        authorizationModelId: process.env.FGA_MODEL_ID,
        credentials: {
            method: CredentialsMethod.ClientCredentials,
            config: {
                apiTokenIssuer: process.env.FGA_API_TOKEN_ISSUER ?? "",
                apiAudience: process.env.FGA_API_AUDIENCE ?? "",
                clientId: process.env.FGA_CLIENT_ID ?? "",
                clientSecret: process.env.FGA_CLIENT_SECRET ?? "",
            },
        }
    });
}