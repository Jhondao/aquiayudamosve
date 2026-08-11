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
  return reports.map(serializeReport);
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

export async function moderateReport(adminId: string, reportId: string, action: "hide" | "unhide" | "markFalse", reason: string) {
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
  }

  await recordAction(adminId, action, reportId, reason);

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
