-- Fase 1 del PROMPT MAESTRO: estado ampliado de necesidades + cantidad
-- requerida/recibida. Vive en Report directamente (nullable), mismo patrón
-- que trustScore — no hay caso de uso donde exista sin un Report.
ALTER TABLE `Report`
    ADD COLUMN `needStatus` ENUM('necesitamos', 'en_camino', 'parcialmente_cubierto', 'cubierto', 'excedente', 'desactualizado') NULL,
    ADD COLUMN `quantityNeeded` DOUBLE NULL,
    ADD COLUMN `quantityUnit` VARCHAR(191) NULL,
    ADD COLUMN `quantityReceived` DOUBLE NOT NULL DEFAULT 0;

-- Backfill: reportes de necesidad creados antes de esta migración deben
-- empezar a mostrar el nuevo estado en vez de quedar sin badge — el
-- problema que Fase 1 resuelve ya está ocurriendo con reportes existentes
-- del terremoto del 10 de agosto.
UPDATE `Report` r
    JOIN `ReportCategory` c ON r.categoryId = c.id
    SET r.needStatus = 'necesitamos'
    WHERE c.`group` = 'necesidad' AND r.deletedAt IS NULL;
