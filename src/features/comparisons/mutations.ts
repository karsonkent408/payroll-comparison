import { ComparisonAPI } from "./api";
import { queryClient } from "@/shared/queryClient";

export const ComparisonMutations = {
    createComparison: {
        mutationFn: ComparisonAPI.createComparison,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["comparisons"] });
        },
    },

    patchComparison: {
        mutationFn: ComparisonAPI.patchComparison,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id] });
        },
    },

    deleteComparison: {
        mutationFn: ComparisonAPI.deleteComparison,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["comparisons"] });
        },
    },

    patchMappingEntry: {
        mutationFn: ComparisonAPI.patchMappingEntry,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "results"] });
        },
    },

    createEmployeePair: {
        mutationFn: ComparisonAPI.createEmployeePair,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "employeePair"] });
        },
    },

    patchEmployeePair: {
        mutationFn: ComparisonAPI.patchEmployeePair,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "employeePair"] });
        },
    },

    deleteEmployeePair: {
        mutationFn: ComparisonAPI.deleteEmployeePair,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "employeePair"] });
        },
    },

    upsertEmployeeMapping: {
        mutationFn: ComparisonAPI.upsertEmployeeMapping,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.removeQueries({ queryKey: ["comparisons", id, "employeeMapping"] });
        },
    },

    upsertColumnMapping: {
        mutationFn: ComparisonAPI.upsertColumnMapping,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "columnMapping"] });
        },
    },

    uploadSource: {
        mutationFn: ComparisonAPI.uploadSource,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "sources"] });
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "columnMapping"] });
            queryClient.invalidateQueries({ queryKey: ["comparisons", id, "employeeMapping"] });
        },
    },

    reconfigure: {
        mutationFn: ComparisonAPI.reconfigure,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ["comparisons", id] });
        },
    },

    runComparison: {
        mutationFn: ComparisonAPI.runComparison,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.removeQueries({ queryKey: ["comparisons", id] });
        },
    },

    patchLegacySourceCells: {
        mutationFn: ComparisonAPI.patchLegacySourceCells,
    },

    patchCollaboratorAccess: {
        mutationFn: ComparisonAPI.patchCollaboratorAccess,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ['comparisons', id, 'collaborators'] });
        },
    },

    removeCollaborator: {
        mutationFn: ComparisonAPI.removeCollaborator,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ['comparisons', id, 'collaborators'] });
        },
    },

    makeOwner: {
        mutationFn: ComparisonAPI.makeOwner,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ['comparisons', id, 'collaborators'] });
        },
    },

    inviteCollaborator: {
        mutationFn: ComparisonAPI.inviteCollaborator,
        onSuccess: (_: unknown, { id }: { id: string }) => {
            queryClient.invalidateQueries({ queryKey: ['comparisons', id, 'collaborators'] });
        },
    },
};
