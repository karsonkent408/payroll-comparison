import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
    ...defaultStatements, 
} as const;


export const ac = createAccessControl(statement);

export const admin = ac.newRole({}); 

export const implementor = ac.newRole({}); 

export const guest = ac.newRole({}); 