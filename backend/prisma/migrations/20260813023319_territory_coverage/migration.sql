-- ACTUALIZACIÓN DEL PROMPT MAESTRO: cobertura nacional en vez de solo Cali.
-- `city` (columna fija, antes limitada por z.enum(CITIES) a 5 valores) se
-- reemplaza por departamento/municipio en texto libre — el backend nunca
-- valida contra ningún catálogo (ver reports.schemas.ts), así que nunca se
-- bloquea una publicación por no estar en una lista predeterminada.
ALTER TABLE `Report`
    ADD COLUMN `departmentName` VARCHAR(191) NULL,
    ADD COLUMN `municipalityName` VARCHAR(191) NULL,
    ADD COLUMN `localityName` VARCHAR(191) NULL,
    ADD COLUMN `locationSource` ENUM('gps', 'catalog', 'manual') NOT NULL DEFAULT 'catalog',
    MODIFY COLUMN `approxLocationText` VARCHAR(191) NULL;

-- Backfill: los 5 valores de `city` que existían se mapean a su
-- departamento real. locationSource ya quedó en 'catalog' por el DEFAULT
-- del paso anterior — exacto para estas filas: se crearon eligiendo una
-- ciudad de una lista fija, el equivalente de hoy a "catalog".
UPDATE `Report`
    SET
        `municipalityName` = `city`,
        `departmentName` = CASE `city`
            WHEN 'Cali' THEN 'Valle del Cauca'
            WHEN 'Pereira' THEN 'Risaralda'
            WHEN 'Manizales' THEN 'Caldas'
            WHEN 'Armenia' THEN 'Quindío'
            WHEN 'Quibdó' THEN 'Chocó'
            ELSE `city`
        END;

ALTER TABLE `Report`
    MODIFY COLUMN `departmentName` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `municipalityName` VARCHAR(191) NOT NULL,
    DROP INDEX `Report_city_idx`,
    DROP COLUMN `city`,
    ADD INDEX `Report_departmentName_municipalityName_idx`(`departmentName`, `municipalityName`);
