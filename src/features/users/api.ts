import { apiClient } from "@/shared/lib/api-client";
import type { UpdateUserInput, SuspendUserInput, CreateUserInput } from "./types";

export const UserAPI = {
    fetchUsers: async (includeSuspended: boolean = false) => {
        const res = await apiClient.api.admin.users.$get({
            query: {
                includeSuspended: String(includeSuspended)
            },
        })
        if (!res.ok) {
            throw new Error(`Could not fetch users: ${res.statusText}`)
        }
        return res.json()
    },

    updateUser: async ({ id, role }: UpdateUserInput) => {
        const res = await apiClient.api.admin.users[":id"].$patch({
            param: { id },
            json: { role },
        });
        if (!res.ok) throw new Error(`Failed to update user: ${res.statusText}`);
        return res.json();
    },

    suspendUser: async ({ id, suspended, reason }: SuspendUserInput) => {
        const res = await apiClient.api.admin.users[":id"].suspend.$post({
            param: { id },
            json: { suspended, reason: reason ?? undefined }
        })
        if (!res.ok) throw new Error(`Failed to supsend user: ${res.statusText}`)
        return res.json()
    },

    deleteUser: async ({ id }: { id: string }) => {
        const res = await apiClient.api.admin.users[":id"].$delete({
            param: { id }
        })
        if (!res.ok) throw new Error(`Failed to delete user: ${res.statusText}`)
        return res.json()
    },

    createUser: async ({ name, email, image, role }: CreateUserInput) => {
        const res = await apiClient.api.admin.users.$post({
            json: { name, email, image, role }
        })
        if (!res.ok) throw new Error(`Failed to create user: ${res.statusText}`)
            return res.json()
    }

}