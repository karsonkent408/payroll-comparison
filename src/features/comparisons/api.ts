import { apiClient } from "@/shared/lib/api-client";
import type {
  CreateComparisonInput,
  UpdateComparisonInput,
  EmployeeMappingInput,
  ReconfigureInput,
  UploadedSource,
} from "./types";
import type { MappingEntryPatch } from "@/server/api/schemas/mappingEntrySchema";
import type {
  EmployeePairPost,
  EmployeePairPatch,
} from "@/server/api/schemas/employeePairSchema";
import type { ColumnMappingBody } from "@/server/api/schemas/columnMappingSchema";

export const ComparisonAPI = {
  fetchComparisons: async (
    page: number = 1,
    pageSize: number = 20,
    filters?: string,
  ) => {
    const query: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };
    if (filters) query.filters = filters;
    const res = await apiClient.api.comparisons.$get({ query });
    if (!res.ok)
      throw new Error(`Failed to fetch comparisons: ${res.statusText}`);
    return res.json();
  },

  fetchComparison: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].$get({ param: { id } });
    if (!res.ok)
      throw new Error(`Failed to fetch comparison: ${res.statusText}`);
    return res.json();
  },

  fetchComparisonResults: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].results.$get({
      param: { id },
    });
    if (!res.ok)
      throw new Error(`Failed to fetch comparison results: ${res.statusText}`);
    return res.json();
  },

  fetchComparisonSources: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].sources.$get({
      param: { id },
    });
    if (!res.ok)
      throw new Error(`Failed to fetch comparison sources: ${res.statusText}`);
    const data = await res.json();
    if (!("legacy" in data))
      throw new Error("Unexpected response from sources endpoint");
    return data;
  },

  fetchComparisonSourceEmployees: async (
    id: string,
    type: "new" | "legacy",
  ) => {
    const res = await apiClient.api.comparisons[":id"].source[
      ":type"
    ].employees.$get({
      param: { id, type },
      query: {},
    });
    if (!res.ok)
      throw new Error(`Failed to fetch ${type} employees: ${res.statusText}`);
    return res.json();
  },

  fetchComparisonColumnMapping: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].columnMapping.$get({
      param: { id },
    });
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(
        `Failed to fetch comparison column mapping: ${res.statusText}`,
      );
    return res.json();
  },

  fetchComparisonEmployeeMapping: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].employeeMapping.$get({
      param: { id },
    });
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(
        `Failed to fetch comparison employee mapping: ${res.statusText}`,
      );
    return res.json();
  },

  fetchComparisonEmployeePair: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].employeePair.$get({
      param: { id },
    });
    if (!res.ok)
      throw new Error(
        `Failed to fetch comparison employee pair: ${res.statusText}`,
      );
    return res.json();
  },

  fetchCollaborators: async (
    id: string,
  ): Promise<
    {
      userId: string;
      access: string;
      userName: string | null;
      userEmail: string | null;
      role: string | null;
    }[]
  > => {
    const res = await apiClient.api.comparisons[":id"].collaborators.$get({
      param: { id }
    });
    if (!res.ok)
      throw new Error(`Failed to fetch collaborators: ${res.statusText}`);
    return res.json();
  },

  patchCollaboratorAccess: async ({
    id,
    userId,
    access,
  }: {
    id: string;
    userId: string;
    access: "viewer" | "editor";
  }) => {
    const res = await apiClient.api.comparisons[":id"].collaborators.$patch({
      param: { id },
      json: { userId, access}
    })
    if (!res.ok)
      throw new Error(
        `Failed to update collaborator access: ${res.statusText}`,
      );
    return res.json();
  },

  removeCollaborator: async ({
    id,
    userId,
  }: {
    id: string;
    userId: string;
    }) => {
    const res = await apiClient.api.comparisons[":id"].collaborators[":userId"].$delete({
      param: { id, userId}
    })
    if (!res.ok)
      throw new Error(`Failed to remove collaborator: ${res.statusText}`);
  },

  inviteCollaborator: async ({ id, email }: { id: string; email: string }) => {
    const res = await apiClient.api.comparisons[":id"].collaborators.invite.$post({
      param: { id },
      json: { email }
    })
    if (!res.ok)
      throw new Error(`Failed to invite collaborator: ${res.statusText}`);
    return res.json();
  },

  makeOwner: async ({ id, userId }: { id: string; userId: string }) => {
    const res = await apiClient.api.comparisons[":id"].collaborators.owner.$patch({
      param: { id },
      json: { userId }
    })
    if (!res.ok)
      throw new Error(`Failed to transfer ownership: ${res.statusText}`);
    return res.json();
  },

  runComparison: async ({ id }: { id: string }) => {
    const res = await apiClient.api.comparisons[":id"].results.run.$post({
      param: { id },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error ?? `Run failed: ${res.statusText}`,
      );
    }
    return res.json();
  },

  createComparison: async (input: CreateComparisonInput) => {
    const res = await apiClient.api.comparisons.$post({ json: input });
    if (!res.ok)
      throw new Error(`Failed to create comparison: ${res.statusText}`);
    return res.json();
  },

  patchComparison: async ({ id, ...input }: UpdateComparisonInput) => {
    const res = await apiClient.api.comparisons[":id"].$patch({
      param: { id },
      json: input,
    });
    if (!res.ok)
      throw new Error(`Failed to update comparison: ${res.statusText}`);
    return res.json();
  },

  deleteComparison: async (id: string) => {
    const res = await apiClient.api.comparisons[":id"].$delete({
      param: { id },
    });
    if (!res.ok)
      throw new Error(`Failed to delete comparison: ${res.statusText}`);
  },

  patchMappingEntry: async ({
    id,
    mappingEntryId,
    ...json
  }: { id: string; mappingEntryId: string } & MappingEntryPatch) => {
    const res = await apiClient.api.comparisons[":id"].mappingEntry[
      ":mappingEntryId"
    ].$patch({
      param: { id, mappingEntryId },
      json,
    });
    if (!res.ok)
      throw new Error(`Failed to update mapping entry: ${res.statusText}`);
    return res.json();
  },

  createEmployeePair: async ({
    id,
    ...json
  }: { id: string } & EmployeePairPost) => {
    const res = await apiClient.api.comparisons[":id"].employeePair.$post({
      param: { id },
      json,
    });
    if (!res.ok)
      throw new Error(`Failed to create employee pair: ${res.statusText}`);
    return res.json();
  },

  patchEmployeePair: async ({
    id,
    pairingId,
    ...json
  }: { id: string; pairingId: string } & EmployeePairPatch) => {
    const res = await apiClient.api.comparisons[":id"].employeePair[
      ":pairingId"
    ].$patch({
      param: { id, pairingId },
      json,
    });
    if (!res.ok)
      throw new Error(`Failed to update employee pair: ${res.statusText}`);
    return res.json();
  },

  deleteEmployeePair: async ({
    id,
    pairingId,
  }: {
    id: string;
    pairingId: string;
  }) => {
    const res = await apiClient.api.comparisons[":id"].employeePair[
      ":pairingId"
    ].$delete({
      param: { id, pairingId },
    });
    if (!res.ok)
      throw new Error(`Failed to delete employee pair: ${res.statusText}`);
  },

  upsertEmployeeMapping: async ({
    id,
    ...json
  }: { id: string } & EmployeeMappingInput) => {
    const res = await apiClient.api.comparisons[":id"].employeeMapping.$post({
      param: { id },
      json,
    });
    if (!res.ok)
      throw new Error(`Failed to save employee mapping: ${res.statusText}`);
    return res.json();
  },

  upsertColumnMapping: async ({
    id,
    ...json
  }: { id: string } & ColumnMappingBody) => {
    const res = await apiClient.api.comparisons[":id"].columnMapping.$post({
      param: { id },
      json,
    });
    if (!res.ok)
      throw new Error(`Failed to save column mapping: ${res.statusText}`);
    return res.json();
  },

  uploadSource: async ({
    id,
    type,
    file,
    legacy_provider,
    format_notes,
    expected_employee_count,
  }: {
    id: string;
    type: "legacy" | "new";
    file: File;
    legacy_provider?: string;
    format_notes?: string;
    expected_employee_count?: number;
  }): Promise<UploadedSource> => {
    const form: {
      file: File;
      legacy_provider?: string;
      format_notes?: string;
      expected_employee_count?: string;
    } = { file };
    if (legacy_provider !== undefined) form.legacy_provider = legacy_provider;
    if (format_notes !== undefined) form.format_notes = format_notes;
    if (expected_employee_count !== undefined)
      form.expected_employee_count = String(expected_employee_count);
    const res = await apiClient.api.comparisons[":id"].sources[":type"].$post({
      param: { id, type },
      form,
    });

    if (!res.ok) throw new Error(`Failed to upload source: ${res.statusText}`);
    return res.json();
  },

  fetchLegacySourceRow: async (id: string, employeeKey: string) => {
    const res = await apiClient.api.comparisons[":id"].sources.legacy.rows[
      ":employeeKey"
    ].$get({
      param: { id, employeeKey },
    });
    if (!res.ok)
      throw new Error(`Failed to fetch legacy source row: ${res.statusText}`);
    return res.json();
  },

  patchLegacySourceCells: async ({
    id,
    employeeKey,
    columnName,
    value,
  }: {
    id: string;
    employeeKey: string;
    columnName: string;
    value: string;
  }) => {
    const res = await apiClient.api.comparisons[
      ":id"
    ].sources.legacy.cells.$patch({
      param: { id },
      json: { employeeKey, columnName, value },
    });
    if (!res.ok)
      throw new Error(`Failed to patch source cells: ${res.statusText}`);
    return res.json();
  },

  reconfigure: async ({
    id,
    mapping,
    resetStatuses,
    resetNotes,
    legacyFile,
    newFile,
  }: ReconfigureInput) => {
    const form: {
      mapping: string,
      reset_statuses?: string,
      reset_notes?: string,
      legacy_file?: File,
      new_file?: File
    }  = { "mapping": JSON.stringify(mapping) }
    if (resetStatuses) form.reset_statuses = 'true'
    if (resetNotes) form.reset_notes = 'true'
    if (legacyFile) form.legacy_file = legacyFile
    if (newFile) form.new_file = newFile
    const res = await apiClient.api.comparisons[":id"].reconfigure.$post({
      param: { id },
      form
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Failed to reconfigure: ${res.statusText}`);
    }
    return res.json();
  },
};
