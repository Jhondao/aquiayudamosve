-- Fase A del PROMPT MAESTRO v3 — compromiso parcial de ayuda ("puedo cubrir
-- X de esto") con tracking de estado, separado de Report.quantityReceived
-- (que sigue siendo un total corriente que solo mueve updateNeedStatus, ver
-- reports.service.ts#updateNeedStatus). NeedCommitment es un ledger de
-- promesas de la comunidad, nunca se suma automáticamente a quantityReceived.
CREATE TABLE `NeedCommitment` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NULL,
    `status` ENUM('committed', 'on_the_way', 'delivered', 'cancelled') NOT NULL DEFAULT 'committed',
    `estimatedArrival` DATETIME(3) NULL,
    `transportMethod` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NeedCommitment_reportId_idx`(`reportId`),
    INDEX `NeedCommitment_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NeedCommitment` ADD CONSTRAINT `NeedCommitment_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NeedCommitment` ADD CONSTRAINT `NeedCommitment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
