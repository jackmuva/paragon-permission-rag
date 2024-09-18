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
    const subject = data.permission;

    let objectType = "doc";
    let subjectType = "user";

    if(object.objectType === "application/vnd.google-apps.folder"){
        objectType = "folder";
        object.objectName = object.objectId;
    }
    if(subject.permissionSubjectType === "group"){
        subjectType = "group"
    }


    await fga.write({
        writes: [
            {
                "user": subjectType + ":" + subject.permissionSubject,
                "relation":subject.permissionType,
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

async function deletePermissions(fga: OpenFgaClient, data: any) {
    const object = data.object;
    const subject = data.permission;

    let objectType = "doc";
    let subjectType = "user";

    if(object.objectType === "application/vnd.google-apps.folder"){
        objectType = "folder";
        object.objectName = object.objectId;
    }
    if(subject.permissionSubjectType === "group"){
        subjectType = "group"
    }


    await fga.write({
        deletes: [
            {
                "user": subjectType + ":" + subject.permissionSubject,
                "relation":subject.permissionType,
                "object": objectType + ":" + object.objectId
            }
        ],
    }, {
        authorizationModelId: process.env.FGA_MODEL_ID
    });
}

export async function updatePermissions(fga: OpenFgaClient, data: any){

    const roles = ["owner", "writer", "viewer"];

    for(const role of roles) {
        let curUsers = await getPermittedUsers(fga, data[0].object.objectId, role);
        let updatedUserPermissions = getUsersOfType(data, role);

        const newUsers = Array.from(new Set(updatedUserPermissions.keys()).difference(curUsers));
        const revokedUsers = Array.from(curUsers.difference(new Set(updatedUserPermissions.keys())));

        for(const user in newUsers){
            try {
                await writePermissions(fga, updatedUserPermissions.get(user));
            }catch(err){
                console.log("Unable to update permission" + err);
            }
        }
        for(const user in revokedUsers){
            try{
                await deletePermissions(fga, updatedUserPermissions.get(user));
            }catch(err){
                console.log("Unable to update permission" + err);
            }
        }
    }
}

function getUsersOfType(data: any, type: string): Map<string, any>{
    const resMap = new Map();

    data.forEach((elem: any) => {
        let subject = elem.permission;

        if(subject.permissionType === type){
            resMap.set(subject.permissionSubject, elem);
        }
    });
    return resMap;
}

async function getPermittedUsers(fga: OpenFgaClient, fileId: string, relationship: string): Promise<Set<string | undefined>>{
    const response = await fga.listUsers({
        object: {
            type: "doc",
            id: fileId,
        },
        user_filters: [{
            type: "user"
        }],
        relation: relationship,
    }, {
        authorizationModelId: process.env.FGA_MODEL_ID
    });
    const resSet = new Set<string>;
    response.users.forEach((obj) => resSet.add(obj.object?.id ?? ""));
    return resSet;
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
    const token = signJwt(userId);
    const response = await fetch(process.env.THIRD_PARTY_VERFICATION ?? "", {
        method: "POST",
        body: JSON.stringify({userId: userId, fileArr: documentIds}),
        headers: {
            "Content-Type": "application/json",
            "Authorization": "bearer " + token,
        },
    })
        .then((response) => response.json())
        .catch((error) => console.log("Error checking with third party: " + error));

    console.log(response);

    return await response.permittedFiles.map((permittedFile: {fileId: string, permitted: boolean}) => {
        if(permittedFile.permitted){
            return permittedFile.fileId;
        }
    })
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

