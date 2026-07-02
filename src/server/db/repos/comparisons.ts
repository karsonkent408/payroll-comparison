import {
  and,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  like,
  lt,
  ne,
  not,
  notLike,
  or,
  sql,
} from "drizzle-orm";
import type {
  CategoryStats,
  ComparisonSummaryData,
} from "@/server/api/util/types";
import {
  collaborator,
  comparisons,
  employeePairing,
  mappingEntries,
} from "@/server/db/schema";
import { user } from "@/server/db/schema/auth-schema";
import type {
  ComparisonStatus,
  ComparisonSummary,
  ListComparisonsResult,
} from "@/server/api/util/types";
import {
  db
} from "@/server/db";

export type ComparisonFilter = {
  field: "label" | "pay_period_start" | "pay_period_end" | "status" | "owner";
  operator: string;
  value: string | string[];
};

export const computedStatus = sql<ComparisonStatus>`
  CASE
    WHEN ${comparisons.setup_complete} = 0 THEN 'setup'
    WHEN (
      SELECT COUNT(*) FROM ${mappingEntries}
      WHERE ${mappingEntries.comparison_id} = ${comparisons.id}
        AND COALESCE(${mappingEntries.manual_override}, ${mappingEntries.auto_status}) = 'unresolved'
    ) > 0 OR (
      SELECT COUNT(*) FROM ${employeePairing}
      WHERE ${employeePairing.comparison_id} = ${comparisons.id}
        AND ${employeePairing.resolved} = 0
        AND (${employeePairing.legacy_key} IS NULL OR ${employeePairing.new_key} IS NULL)
    ) > 0 THEN 'fail'
    ELSE 'pass'
  END
`;

const ownerColumns = { name: user.name, id: user.id };

class ComparisonRepository {
  buildFilterConditions(filters: ComparisonFilter[]) {
    return filters.flatMap((f) => {
      const v = f.value as string;
      const vs = f.value as string[];

      if (f.field === "label") {
        if (f.operator === "is") return [eq(comparisons.label, v)];
        if (f.operator === "is not") return [ne(comparisons.label, v)];
        if (f.operator === "contains")
          return [like(comparisons.label, `%${v}%`)];
        if (f.operator === "does not contain")
          return [notLike(comparisons.label, `%${v}%`)];
      }

      if (f.field === "pay_period_start" || f.field === "pay_period_end") {
        const col =
          f.field === "pay_period_start"
            ? comparisons.pay_period_start
            : comparisons.pay_period_end;
        if (f.operator === "is") return [eq(col, v)];
        if (f.operator === "is not") return [ne(col, v)];
        if (f.operator === "is before") return [lt(col, v)];
        if (f.operator === "is after") return [gt(col, v)];
        if (f.operator === "is between")
          return [gt(col, vs[0]), lt(col, vs[1])];
      }

      if (f.field === "owner") {
        const ownerSubquery = db
          .select({ id: collaborator.id })
          .from(collaborator)
          .where(
            and(
              eq(collaborator.comparisonId, comparisons.id),
              eq(collaborator.access, "owner"),
              eq(collaborator.userId, v),
            ),
          );
        if (f.operator === "is") return [exists(ownerSubquery)];
        if (f.operator === "is not") return [not(exists(ownerSubquery))];
      }

      if (f.field === "status") {
        if (f.operator === "is") return [sql`(${computedStatus}) = ${v}`];
        if (f.operator === "is not") return [sql`(${computedStatus}) != ${v}`];
        if (f.operator === "is one of")
          return [or(...vs.map((s) => sql`(${computedStatus}) = ${s}`))!];
        if (f.operator === "is not one of")
          return vs.map((s) => sql`(${computedStatus}) != ${s}`);
      }

      return [];
    });
  }

  async list(opts: {
    filters?: ComparisonFilter[];
    page?: number;
    pageSize?: number;
    viewerId?: string;
    viewerRole?: string;
  }): Promise<ListComparisonsResult> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.max(1, opts.pageSize ?? 20);
    const offset = (page - 1) * pageSize;

    const conditions = this.buildFilterConditions(opts.filters ?? []);
    if (
      opts.viewerId &&
      opts.viewerRole !== "admin" &&
      opts.viewerRole !== "implementor"
    ) {
      conditions.push(
        exists(
          db
            .select({ id: collaborator.id })
            .from(collaborator)
            .where(
              and(
                eq(collaborator.comparisonId, comparisons.id),
                eq(collaborator.userId, opts.viewerId),
              ),
            ),
        ),
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        ...getTableColumns(comparisons),
        status: computedStatus,
        owner: ownerColumns,
      })
      .from(comparisons)
      .leftJoin(
        collaborator,
        and(
          eq(collaborator.comparisonId, comparisons.id),
          eq(collaborator.access, "owner"),
        ),
      )
      .leftJoin(user, eq(user.id, collaborator.userId))
      .where(where)
      .orderBy(desc(comparisons.created_at))
      .limit(pageSize)
      .offset(offset)
      .all();

    const [{ total }] = await db
      .select({ total: count() })
      .from(comparisons)
      .where(where)
      .all();

    return { items: rows as ComparisonSummary[], total, page, pageSize };
  }

  async find(id: number): Promise<ComparisonSummary | null> {
    const [row] = await db
      .select({
        ...getTableColumns(comparisons),
        status: computedStatus,
        owner: ownerColumns,
      })
      .from(comparisons)
      .leftJoin(
        collaborator,
        and(
          eq(collaborator.comparisonId, comparisons.id),
          eq(collaborator.access, "owner"),
        ),
      )
      .leftJoin(user, eq(collaborator.userId, user.id))
      .where(eq(comparisons.id, id))
      .all();
    return row ? (row as ComparisonSummary) : null;
  }

  async create(data: {
    label: string;
    pay_period_start: string;
    pay_period_end: string;
    description?: string;
    created_by?: string | null;
    owner_id: string;
  }): Promise<ComparisonSummary> {
    const [insertResults, , ownerResults] = await db.batch([
      db
        .insert(comparisons)
        .values({
          label: data.label,
          pay_period_start: data.pay_period_start,
          pay_period_end: data.pay_period_end,
          description: data.description ?? null,
          created_by: data.created_by ?? null,
        })
        .returning(),
      db.insert(collaborator).values({
        comparisonId: sql`last_insert_rowid()`,
        userId: data.owner_id,
        access: "owner",
        createdBy: data.owner_id,
      }),
      db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(eq(user.id, data.owner_id)),
    ]);

    const [row] = insertResults;
    const [ownerUser] = ownerResults;

    return { ...row, status: "setup" as const, owner: ownerUser ?? null };
  }

  async update(
    id: number,
    data: {
      label?: string;
      pay_period_start?: string;
      pay_period_end?: string;
      description?: string;
      sort_preference?: string;
      expected_employee_count?: number | null;
    },
  ): Promise<ComparisonSummary | null> {
    const existing = await this.find(id);
    if (!existing) return null;

    const [row] = await db
      .update(comparisons)
      .set({
        label: data.label ?? existing.label,
        pay_period_start: data.pay_period_start ?? existing.pay_period_start,
        pay_period_end: data.pay_period_end ?? existing.pay_period_end,
        description:
          data.description !== undefined
            ? data.description
            : existing.description,
        sort_preference: data.sort_preference ?? existing.sort_preference,
        ...(data.expected_employee_count !== undefined
          ? { expected_employee_count: data.expected_employee_count }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .where(eq(comparisons.id, id))
      .returning()
      .all();

    return this.find(row.id);
  }

  async delete(id: number): Promise<boolean> {
    const deleted = await db
      .delete(comparisons)
      .where(eq(comparisons.id, id))
      .returning({ id: comparisons.id })
      .all();
    return deleted.length > 0;
  }

  async getStatus(id: number): Promise<ComparisonStatus | null> {
    const [row] = await db
      .select({ status: computedStatus })
      .from(comparisons)
      .where(eq(comparisons.id, id));
    return row ? row.status : null;
  }

  async getSummary(id: number): Promise<ComparisonSummaryData | null> {
    const status = await this.getStatus(id);
    if (status === null) return null;

    const [categoryRows, unmatchedRows] = await Promise.all([
      db.all<{ category: string; total: number; resolved: number }>(sql`
        SELECT cm.category, COUNT(*) as total,
          SUM(CASE WHEN COALESCE(me.manual_override, me.auto_status) = 'resolved' THEN 1 ELSE 0 END) as resolved
        FROM mapping_entries me
        JOIN column_mapping cm ON cm.id = me.column_mapping_id
        WHERE me.comparison_id = ${id}
        GROUP BY cm.category
      `),
      db.all<{ total: number; resolved: number }>(sql`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
        FROM employee_pairings
        WHERE comparison_id = ${id}
          AND (legacy_key IS NULL OR new_key IS NULL)
      `),
    ]);

    const byCategory: Record<string, CategoryStats> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = { total: row.total, resolved: row.resolved };
    }

    const [unmatchedRow] = unmatchedRows;
    return {
      status,
      byCategory,
      unmatched: {
        total: unmatchedRow?.total ?? 0,
        resolved: unmatchedRow?.resolved ?? 0,
      },
    };
  }
}

// export { ComparisonRepository };
export const comparisonRepo = new ComparisonRepository()