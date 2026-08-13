-- Visibilidad de moderación (hide/unhide) separada del ciclo de vida real
-- de la mascota (PetReport.status: lost/found/reunited/...) — mezclarlas en
-- el mismo campo conflictuaría "oculto por moderación" con el estado real.
ALTER TABLE `PetReport` ADD COLUMN `hidden` BOOLEAN NOT NULL DEFAULT false;
