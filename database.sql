-- =============================================================================
-- DATABASE SCHEMA VOOR HET SCHAAKSPEL (database.sql)
-- =============================================================================
-- Dit script kun je importeren in XAMPP phpMyAdmin (http://localhost/phpmyadmin)
-- of de server.js voert dit automatisch voor je uit bij het opstarten!
-- =============================================================================

-- 1. Maak de database aan als deze nog niet bestaat
CREATE DATABASE IF NOT EXISTS `schaak_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `schaak_db`;

-- 2. Maak de gebruikers tabel aan voor inloggen en registreren
CREATE TABLE IF NOT EXISTS `gebruikers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `gebruikersnaam` VARCHAR(50) NOT NULL UNIQUE,
  `wachtwoord` VARCHAR(255) NOT NULL,
  `elo` INT DEFAULT 1200,
  `gewonnen` INT DEFAULT 0,
  `verloren` INT DEFAULT 0,
  `remise` INT DEFAULT 0,
  `aangemaakt_op` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Voeg eventueel alvast een test-account toe (wachtwoord: test1234)
INSERT IGNORE INTO `gebruikers` (`id`, `gebruikersnaam`, `wachtwoord`, `elo`, `gewonnen`, `verloren`, `remise`) 
VALUES (1, 'GrootmeesterNL', 'test1234', 1500, 10, 2, 1);
