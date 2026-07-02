import { queryOptions, useQuery } from "@tanstack/react-query";
import { ComparisonAPI } from "./api";

type ExtraOptions<F extends (...args: never[]) => object> = Omit<
    Partial<ReturnType<F>>,
    'queryKey' | 'queryFn'
>

const comparison = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id],
        queryFn: () => ComparisonAPI.fetchComparison(id),
    })

const comparisonColumnMapping = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'columnMapping'],
        queryFn: () => ComparisonAPI.fetchComparisonColumnMapping(id),
    })

const comparisonEmployeeMapping = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'employeeMapping'],
        queryFn: () => ComparisonAPI.fetchComparisonEmployeeMapping(id),
    })

const comparisonEmployeePair = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'employeePair'],
        queryFn: () => ComparisonAPI.fetchComparisonEmployeePair(id),
    })

const comparisonResults = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'results'],
        queryFn: () => ComparisonAPI.fetchComparisonResults(id),
    })

const comparisons = (page: number = 1, pageSize: number = 20, filters?: string) =>
    queryOptions({
        queryKey: ['comparisons', page, pageSize, filters],
        queryFn: () => ComparisonAPI.fetchComparisons(page, pageSize, filters),
    })

const comparisonSources = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'sources'],
        queryFn: () => ComparisonAPI.fetchComparisonSources(id),
    })

const collaborators = (id: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'collaborators'],
        queryFn: () => ComparisonAPI.fetchCollaborators(id),
    })

const comparisonSourceEmployees = (id: string, type: 'new' | 'legacy') =>
    queryOptions({
        queryKey: ['comparisons', id, 'source', type, 'employees'],
        queryFn: () => ComparisonAPI.fetchComparisonSourceEmployees(id, type),
    })

const legacySourceRow = (id: string, employeeKey: string) =>
    queryOptions({
        queryKey: ['comparisons', id, 'sources', 'legacy', 'rows', employeeKey],
        queryFn: () => ComparisonAPI.fetchLegacySourceRow(id, employeeKey),
    })

export const ComparisonQueries = {
    comparison,
    useComparison: (id: string, options?: ExtraOptions<typeof comparison>) =>
        useQuery({ ...comparison(id), ...options }),

    comparisonColumnMapping,
    useComparisonColumnMapping: (id: string, options?: ExtraOptions<typeof comparisonColumnMapping>) =>
        useQuery({ ...comparisonColumnMapping(id), ...options }),

    comparisonEmployeeMapping,
    useComparisonEmployeeMapping: (id: string, options?: ExtraOptions<typeof comparisonEmployeeMapping>) =>
        useQuery({ ...comparisonEmployeeMapping(id), ...options }),

    comparisonEmployeePair,
    useComparisonEmployeePair: (id: string, options?: ExtraOptions<typeof comparisonEmployeePair>) =>
        useQuery({ ...comparisonEmployeePair(id), ...options }),

    comparisonResults,
    useComparisonResults: (id: string, options?: ExtraOptions<typeof comparisonResults>) =>
        useQuery({ ...comparisonResults(id), ...options }),

    comparisons,
    useComparisons: (page: number = 1, pageSize: number = 20, filters?: string, options?: ExtraOptions<typeof comparisons>) =>
        useQuery({ ...comparisons(page, pageSize, filters), ...options }),

    comparisonSources,
    useComparisonSources: (id: string, options?: ExtraOptions<typeof comparisonSources>) =>
        useQuery({ ...comparisonSources(id), ...options }),

    collaborators,
    useCollaborators: (id: string, options?: ExtraOptions<typeof collaborators>) =>
        useQuery({ ...collaborators(id), ...options }),

    comparisonSourceEmployees,
    useComparisonSourceEmployees: (id: string, type: 'new' | 'legacy', options?: ExtraOptions<typeof comparisonSourceEmployees>) =>
        useQuery({ ...comparisonSourceEmployees(id, type), ...options }),

    legacySourceRow,
    useLegacySourceRow: (id: string, employeeKey: string, options?: ExtraOptions<typeof legacySourceRow>) =>
        useQuery({ ...legacySourceRow(id, employeeKey), ...options }),
}
