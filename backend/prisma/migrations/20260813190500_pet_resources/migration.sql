-- Fase 3 del módulo de mascotas: directorio "quiero ayudar con mascotas".
-- CreateTable
CREATE TABLE `PetResource` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('veterinary', 'transport', 'temporary_home', 'attention_point', 'rescue', 'other') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `departmentName` VARCHAR(191) NOT NULL,
    `municipalityName` VARCHAR(191) NOT NULL,
    `availabilityNote` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `PetResource_category_idx`(`category`),
    INDEX `PetResource_departmentName_municipalityName_idx`(`departmentName`, `municipalityName`),
    INDEX `PetResource_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PetResource` ADD CONSTRAINT `PetResource_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
