-- PROMPT MAESTRO — MÓDULO COMUNITARIO DE MASCOTAS, Fase 1. Deliberadamente
-- sin trustScore/confirmations — mascotas no tiene sistema de confianza
-- todavía (eso es justo lo que las confirmaciones comunitarias de Fase 2
-- agregarían). PetShareEvent es un modelo propio, no una generalización de
-- ShareEvent (que ya tiene una FK dura a Report).
CREATE TABLE `PetReport` (
    `id` VARCHAR(191) NOT NULL,
    `reportType` ENUM('lost', 'found', 'injured', 'needs_help') NOT NULL,
    `species` ENUM('dog', 'cat', 'bird', 'rabbit', 'horse', 'other') NOT NULL,
    `name` VARCHAR(191) NULL,
    `breed` VARCHAR(191) NULL,
    `sex` ENUM('male', 'female', 'unknown') NOT NULL DEFAULT 'unknown',
    `size` ENUM('small', 'medium', 'large') NULL,
    `primaryColor` VARCHAR(191) NULL,
    `distinctiveFeatures` TEXT NULL,
    `description` TEXT NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `status` ENUM('lost', 'sighted', 'sheltered', 'possible_match', 'found', 'reunited', 'needs_help', 'closed', 'outdated') NOT NULL,
    `helpCategory` ENUM('veterinary', 'food', 'water', 'transport', 'shelter', 'rescue', 'other') NULL,
    `isEmergency` BOOLEAN NULL,
    `departmentName` VARCHAR(191) NOT NULL,
    `municipalityName` VARCHAR(191) NOT NULL,
    `localityName` VARCHAR(191) NULL,
    `approxLocationText` VARCHAR(191) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `locationSource` ENUM('gps', 'catalog', 'manual') NOT NULL DEFAULT 'manual',
    `happenedAt` DATETIME(3) NULL,
    `isSheltered` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `lastConfirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `PetReport_departmentName_municipalityName_idx`(`departmentName`, `municipalityName`),
    INDEX `PetReport_status_idx`(`status`),
    INDEX `PetReport_lat_lng_idx`(`lat`, `lng`),
    INDEX `PetReport_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PetShareEvent` (
    `id` VARCHAR(191) NOT NULL,
    `petReportId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `channel` ENUM('whatsapp', 'web_share', 'copy_link', 'save_image') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PetShareEvent_petReportId_idx`(`petReportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PetReport` ADD CONSTRAINT `PetReport_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PetShareEvent` ADD CONSTRAINT `PetShareEvent_petReportId_fkey` FOREIGN KEY (`petReportId`) REFERENCES `PetReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PetShareEvent` ADD CONSTRAINT `PetShareEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
