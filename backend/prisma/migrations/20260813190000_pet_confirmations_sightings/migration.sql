-- Fase 2 del módulo de mascotas: confirmaciones (reusa ConfirmationType, el
-- mismo enum que ReportConfirmation) y avistamientos ("LA VI AQUÍ").
-- CreateTable
CREATE TABLE `PetConfirmation` (
    `id` VARCHAR(191) NOT NULL,
    `petReportId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('confirm', 'unsure', 'incorrect') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PetConfirmation_petReportId_idx`(`petReportId`),
    INDEX `PetConfirmation_userId_idx`(`userId`),
    UNIQUE INDEX `PetConfirmation_petReportId_userId_type_key`(`petReportId`, `userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PetSighting` (
    `id` VARCHAR(191) NOT NULL,
    `petReportId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PetSighting_petReportId_idx`(`petReportId`),
    INDEX `PetSighting_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PetConfirmation` ADD CONSTRAINT `PetConfirmation_petReportId_fkey` FOREIGN KEY (`petReportId`) REFERENCES `PetReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PetConfirmation` ADD CONSTRAINT `PetConfirmation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PetSighting` ADD CONSTRAINT `PetSighting_petReportId_fkey` FOREIGN KEY (`petReportId`) REFERENCES `PetReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PetSighting` ADD CONSTRAINT `PetSighting_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
