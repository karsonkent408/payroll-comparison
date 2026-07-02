import { UserAPI } from "./api";
import { queryClient } from "@/shared/queryClient";

export const userMutations = {
    patchUser: {
        mutationFn: UserAPI.updateUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
        },
    },
    suspendUser: {
        mutationFn: UserAPI.suspendUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users']})
        }
    },
    deleteUser: {
        mutationFn: UserAPI.deleteUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users']})
        }
    },
    createUser: {
        mutationFn: UserAPI.createUser,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users']})
        }
    }

};

