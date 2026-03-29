-- Quartier Bike ID — Database Schema

-- Users (neighbours) — passwordless magic link auth
-- No password_hash column — authentication is via email magic links
CREATE TABLE users (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  email          VARCHAR(150) UNIQUE NOT NULL,
  name           VARCHAR(100),
  phone          VARCHAR(30),
  created_at     DATETIME DEFAULT NOW()
);

-- Magic link tokens — used for both registration and login
-- A new token is generated each time a user requests a login link.
-- Tokens expire after 15 minutes and are single-use.
CREATE TABLE magic_tokens (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  email          VARCHAR(150) NOT NULL,
  token          VARCHAR(64) UNIQUE NOT NULL,
  expires_at     DATETIME NOT NULL,
  used           BOOLEAN DEFAULT FALSE,
  created_at     DATETIME DEFAULT NOW(),
  INDEX idx_email (email),
  INDEX idx_expires_used (expires_at, used)
);

-- Bicycles (many per user)
CREATE TABLE bicycles (
  id                   INT PRIMARY KEY AUTO_INCREMENT,
  owner_id             INT NOT NULL,
  tag_uid              VARCHAR(50) UNIQUE NOT NULL,
  brand                VARCHAR(100),
  color                VARCHAR(50),
  description          VARCHAR(300),
  photo_url            VARCHAR(200),
  status               ENUM('active','stolen','inactive') DEFAULT 'active',
  garage_parking       BOOLEAN DEFAULT FALSE,
  garage_start_date    DATETIME NULL,
  payment_status       ENUM('pending','paid','exempt') DEFAULT 'pending',
  payment_date         DATETIME NULL,
  payment_due_date     DATETIME NULL,
  payment_reminder_sent BOOLEAN DEFAULT FALSE,
  payment_amount       DECIMAL(6,2) DEFAULT 40.00,
  registered           DATETIME DEFAULT NOW(),
  INDEX idx_owner_id (owner_id),
  INDEX idx_status (status),
  INDEX idx_garage_payment (garage_parking, payment_status, payment_due_date),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Scan log
CREATE TABLE scans (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  bicycle_id          INT NOT NULL,
  scanned_at          DATETIME DEFAULT NOW(),
  lat                 DECIMAL(10, 8) NULL,
  lng                 DECIMAL(11, 8) NULL,
  accuracy            FLOAT NULL,
  city                VARCHAR(100) NULL,
  user_agent          VARCHAR(300),
  location_expires_at DATETIME NULL,
  INDEX idx_bicycle_id (bicycle_id),
  INDEX idx_scanned_at (scanned_at),
  INDEX idx_location_expires (location_expires_at),
  FOREIGN KEY (bicycle_id) REFERENCES bicycles(id) ON DELETE CASCADE
);

-- Contact messages from finders
CREATE TABLE contact_messages (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  bicycle_id   INT NOT NULL,
  finder_name  VARCHAR(100),
  finder_phone VARCHAR(30),
  message      TEXT,
  sent_at      DATETIME DEFAULT NOW(),
  INDEX idx_bicycle_id (bicycle_id),
  FOREIGN KEY (bicycle_id) REFERENCES bicycles(id) ON DELETE CASCADE
);
