export type UpdateUserInput = {
    id: string;
    role: string;
};

export type SuspendUserInput = {
    id: string,
    suspended: boolean,
    reason?: string | null
}

export type CreateUserInput = {
    name: string,
    email: string,
    image?: string,
    role: 'admin' | 'implementor' | 'guest'
}