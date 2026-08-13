import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { penalizeForFalseInformation } from "../trust/reputation.service";
import { serializeReport } from "../reports/reports.service";

const reportInclude = {
  category: true,
  organization: true,
  confirmations: true,
  evidence: true,
  flags: { where: { resolved: false } },
  updates: { orderBy: { createdAt: "asc" as const } },
  needCommitments: { orderBy: { createdAt: "desc" as const } },
};

export async function listFlaggedReports() {
  const reports = await prisma.report.findMany({
    where: {
      deletedAt: null,
      OR: [{ status: "hidden" }, { flags: { some: { resolved: false } } }],
    },
    include: reportInclude,
    orderBy: { updatedAt: "desc" },
  });
  return reports.map((r) => serializeReport(r));
}

// Unlike the public /api/reports listing, this is not limited to
// active/inactive — moderators need to see hidden reports here too, and
// nothing is paginated since admin review is expected to look at everything.
export async function listAllReports(filters: { departmentName?: string; municipalityName?: string; status?: string }) {
  const reports = await prisma.report.findMany({
    where: {
      deletedAt: null,
      ...(filters.departmentName ? { departmentName: filters.departmentName } : {}),
      ...(filters.municipalityName ? { municipalityName: filters.municipalityName } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
    },
    include: reportInclude,
    orderBy: { createdAt: "desc" },
  });
  return reports.map((r) => serializeReport(r));
}

async function recordAction(adminId: string, action: string, reportId: string, reason: string) {
  await prisma.moderationAction.create({
    data: { adminId, action, targetType: "report", targetId: reportId, reason },
  });
  // Every administrative change gets an immutable audit trail entry (section 25) —
  // a report's history is never silently rewritten, only appended to.
  await prisma.auditLog.create({
    data: { actorId: adminId, action: `moderation.${action}`, entityType: "report", entityId: reportId, metadata: { reason } },
  });
}

export async function moderateReport(
  adminId: string,
  reportId: string,
  action: "hide" | "unhide" | "markFalse" | "resolve" | "delete",
  reason: string
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report || report.deletedAt) throw new HttpError(404, "Reporte no encontrado.");

  if (action === "hide") {
    await prisma.report.update({ where: { id: reportId }, data: { status: "hidden" } });
  } else if (action === "unhide") {
    await prisma.report.update({ where: { id: reportId }, data: { status: "active" } });
  } else if (action === "markFalse") {
    await prisma.$transaction([
      prisma.report.update({ where: { id: reportId }, data: { status: "hidden", trustScore: 0 } }),
      prisma.reportFlag.updateMany({ where: { reportId }, data: { resolved: true } }),
    ]);
    await penalizeForFalseInformation(report.createdById);
  } else if (action === "resolve") {
    // Not "wrong", just no longer current (need met, shelter closed, etc.) —
    // distinct from hide/markFalse, which are trust/accuracy judgments.
    await prisma.report.update({ where: { id: reportId }, data: { status: "inactive" } });
  } else if (action === "delete") {
    // Soft delete (same pattern as User/Organization) — the row stays for
    // the audit trail, but disappears from every listing immediately.
    await prisma.report.update({ where: { id: reportId }, data: { deletedAt: new Date() } });
  }

  await recordAction(adminId, action, reportId, reason);

  if (action === "delete") return null;

  const updated = await prisma.report.findUniqueOrThrow({ where: { id: reportId }, include: reportInclude });
  return serializeReport(updated);
}

export async function listAuditLog(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { displayName: true } } },
  });
}
