import {CredentialsMethod, OpenFgaClient} from "@openfga/sdk";
import jwt from "jsonwebtoken";

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

export async function writePermissions(fga: OpenFgaClient, data: any){
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

export async function writeFileRelationship(fga: OpenFgaClient, data: any){
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


export async function getPermittedDocuments(userId: string | undefined | (() => string) = undefined): Promise<Array<string>>{
    if(userId === undefined){
        return [];
    }

    const fga = getFga();

    const response = await fga.listObjects({
        user: "user:" + userId,
        relation: "owner",
        type: "doc",
    }, {
        authorizationModelId: process.env.FGA_MODEL_ID,
    });

    return response.objects.map((document: string) => {
        return document.split(":")[1]
    });
}

export async function checkThirdPartyPermissions(documentIds: Array<string>, userId: string | undefined | (() => string) = undefined): Promise<Array<string>>{
    if(userId === undefined){
        return [];
    }
    console.log("checking third party permissions");
    const permittedIds = []
    const token = signJwt(userId);

    for(let i = 0; i < documentIds.length; i++){
        let id = documentIds[i];
        let response = await fetch(process.env.THIRD_PARTY_VERFICATION ?? "", {
            method: "POST",
            body: JSON.stringify({ userId: userId, fileId: id }),
            headers: {
                "Content-Type": "application/json",
                "Authorization": "bearer " + token,
            },
        }).then((response) => response.json());
        if(response.isPermitted){
            permittedIds.push(id);
        }
    }
    return permittedIds
}

function signJwt(userId: string | undefined | (() => string)): string {
    const currentTime = Math.floor(Date.now() / 1000);

    return jwt.sign(
        {
            sub: userId,
            iat: currentTime,
            exp: currentTime + (60 * 60), // 1 hour from now
        },
        process.env.SIGNING_KEY?.replaceAll("\\n", "\n") ?? "",
        {
            algorithm: "RS256",
        }
    )
}