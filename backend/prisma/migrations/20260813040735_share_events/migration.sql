-- PROMPT MAESTRO — COMPARTIR REPORTES CONFIRMADOS POR WHATSAPP. Telemetría
-- mínima de qué canal se usó para compartir (nunca destinatarios ni
-- números), escritura best-effort — nunca se sirve junto al reporte.
CREATE TABLE `ShareEvent` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `channel` ENUM('whatsapp', 'web_share', 'copy_link', 'save_image') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShareEvent_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ShareEvent` ADD CONSTRAINT `ShareEvent_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareEvent` ADD CONSTRAINT `ShareEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
