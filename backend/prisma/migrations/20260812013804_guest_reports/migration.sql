-- Allow publishing without an account: reports/need-help can be created by
-- email+phone alone, backed by a passwordless "guest" User row that can
-- later be claimed via normal registration (see auth.service.ts).
ALTER TABLE `User`
    MODIFY `passwordHash` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `isGuest` BOOLEAN NOT NULL DEFAULT false;
