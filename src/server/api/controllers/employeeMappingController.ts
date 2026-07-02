import type { EmployeeMappingBody } from "@/server/api/schemas/employeeMappingSchema";
import { employeeMappingRepo } from "@/server/db/repos/employeeMapping";
import { employeePairingRepo } from "@/server/db/repos/employeePairing";
import type { ControllerReturn } from "@/server/api/util/types";
import type { StoredEmployeeMapping } from "@/server/db/repos/employeeMapping";

export class EmployeeMappingController {
  async getEmployeeMapping(
    comparisonId: number,
  ): Promise<ControllerReturn<StoredEmployeeMapping>> {
    const mapping = await employeeMappingRepo.findByComparisonId(
      comparisonId,
    );
    if (!mapping) return { status: 404, error: "No employee mapping found" };
    return { status: 200, data: mapping };
  }

  async postEmployeeMapping(
    comparisonId: number,
    body: EmployeeMappingBody,
  ): Promise<ControllerReturn<StoredEmployeeMapping>> {
    const mapping = await employeeMappingRepo.upsert(comparisonId, {
      legacy_employee_key: body.legacy_employee_key,
      new_employee_key: body.new_employee_key,
      employee_match_mode: body.employee_match_mode ?? "exact",
      new_first_name_column: body.new_first_name_column ?? null,
      new_last_name_column: body.new_last_name_column ?? null,
    });

    await employeePairingRepo.deleteAll(comparisonId);

    return { status: 200, data: mapping };
  }
}
