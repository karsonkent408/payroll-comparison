import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { employeePairing } from "@/server/db/schema";
import { compositeEmployeeKey } from "@/lib/compositeEmployeeKey";

export type EmployeePairing = typeof employeePairing.$inferSelect;
export type MatchedEmployeePairing = Omit<EmployeePairing, 'legacy_key' | 'new_key'> & {
  legacy_key: string;
  new_key: string;
};

export class EmployeePairingRepository {

  async getAll(comparison_id: number): Promise<EmployeePairing[]> {
    return db
      .select()
      .from(employeePairing)
      .where(eq(employeePairing.comparison_id, comparison_id))
      .all();
  }

  async getMatched(comparison_id: number): Promise<MatchedEmployeePairing[]> {
    const rows = await db
      .select()
      .from(employeePairing)
      .where(
        and(
          eq(employeePairing.comparison_id, comparison_id),
          isNotNull(employeePairing.legacy_key),
          isNotNull(employeePairing.new_key)
        )
      )
      .all();
    return rows.filter((p): p is MatchedEmployeePairing => p.legacy_key !== null && p.new_key !== null);
  }

  async findByLegacyKey(comparison_id: number, legacy_key: string): Promise<EmployeePairing | null> {
    const row = await db
      .select()
      .from(employeePairing)
      .where(
        and(
          eq(employeePairing.comparison_id, comparison_id),
          eq(employeePairing.legacy_key, legacy_key)
        )
      )
      .get();
    return row ?? null;
  }

  async add(comparison_id: number, legacy_key: string, new_key: string): Promise<EmployeePairing> {
    const [row] = await db
      .insert(employeePairing)
      .values({ id: crypto.randomUUID(), comparison_id, legacy_key, new_key })
      .returning();
    return row;
  }

  async update(comparison_id: number, pairingId: string, updates: Partial<{ resolved: boolean; note: string | null }>): Promise<EmployeePairing | null> {
    const existing = await db
      .select()
      .from(employeePairing)
      .where(and(eq(employeePairing.comparison_id, comparison_id), eq(employeePairing.id, pairingId)))
      .get();
    if (!existing) return null;

    const [row] = await db
      .update(employeePairing)
      .set(updates)
      .where(and(eq(employeePairing.comparison_id, comparison_id), eq(employeePairing.id, pairingId)))
      .returning();
    return row;
  }

  async remove(comparison_id: number, pairingId: string): Promise<boolean> {
    const existing = await db
      .select({ id: employeePairing.id })
      .from(employeePairing)
      .where(and(eq(employeePairing.comparison_id, comparison_id), eq(employeePairing.id, pairingId)))
      .all();
    if (existing.length === 0) return false;

    await db
      .delete(employeePairing)
      .where(and(eq(employeePairing.comparison_id, comparison_id), eq(employeePairing.id, pairingId)));
    return true;
  }

  async deleteAll(comparison_id: number): Promise<void> {
    await db.delete(employeePairing).where(eq(employeePairing.comparison_id, comparison_id));
  }

  async prune(comparison_id: number, type: "legacy" | "new", rows: Record<string, string>[], keyCol: string[]): Promise<void> {
    const existingKeys = new Set(rows.map((r) => compositeEmployeeKey(r, keyCol)));
    const pairings = await this.getAll(comparison_id);

    const staleIds: string[] = pairings
      .filter((p) => {
        const key = type === "legacy" ? p.legacy_key : p.new_key;
        return !existingKeys.has(key ?? "");
      })
      .map((p) => p.id);

    if (staleIds.length > 0) {
      await db.delete(employeePairing).where(inArray(employeePairing.id, staleIds));
    }
  }
}

export const employeePairingRepo = new EmployeePairingRepository()