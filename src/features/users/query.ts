import { useQuery } from "@tanstack/react-query";
import { UserAPI } from "@/features/users/api";

export const userQueries = {
    useUsers: (includeSuspended: boolean = false) => {
    return useQuery({
        queryKey: ['users', { includeSuspended }],
        queryFn: () => UserAPI.fetchUsers(includeSuspended),
    })
}
}
