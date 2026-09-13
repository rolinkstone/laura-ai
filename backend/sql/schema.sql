-- ============================================================
-- BPOM AI - Database Schema
-- Database: bbpom_ai
-- Karakter: utf8mb4 (mendukung bahasa Indonesia & emoji)
-- ============================================================

CREATE DATABASE IF NOT EXISTS bbpom_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bbpom_ai;

-- ------------------------------------------------------------
-- 1. roles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  nip VARCHAR(30) NULL,
  role_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id)
    REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_users_role (role_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. sources  (sumber referensi: URL, PDF, regulasi, dll)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('url', 'pdf', 'docx', 'regulasi', 'lainnya') NOT NULL DEFAULT 'url',
  url VARCHAR(500) NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. document_categories
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  parent_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_cat_parent FOREIGN KEY (parent_id)
    REFERENCES document_categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
  UNIQUE KEY uq_document_categories_name (name),
  INDEX idx_doc_cat_parent (parent_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. documents
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category_id INT NULL,
  source_id INT NULL,
  file_path VARCHAR(500) NULL,
  file_type VARCHAR(50) NULL,
  uploaded_by INT NULL,
  document_date DATE NULL,
  effective_date DATE NULL,
  status ENUM('draft', 'uploaded', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'draft',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_category FOREIGN KEY (category_id)
    REFERENCES document_categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_documents_source FOREIGN KEY (source_id)
    REFERENCES sources(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_documents_uploader FOREIGN KEY (uploaded_by)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_documents_category (category_id),
  INDEX idx_documents_source (source_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. document_chunks  (potongan teks untuk RAG / semantic search)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_chunks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  chunk_index INT NOT NULL,
  content LONGTEXT NOT NULL,
  page_number INT NULL,
  section VARCHAR(255) NULL,
  embedding JSON NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chunks_document FOREIGN KEY (document_id)
    REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_chunks_document (document_id),
  INDEX idx_chunks_document_index (document_id, chunk_index)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. faq
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faq (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  answer LONGTEXT NOT NULL,
  category VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. chat_sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Percakapan baru',
  status ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_chat_sessions_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. chat_messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content LONGTEXT NOT NULL,
  sources JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id)
    REFERENCES chat_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_chat_messages_session (session_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 10. ai_logs  (log pemakaian model AI)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  model VARCHAR(100) NULL,
  prompt LONGTEXT NULL,
  response LONGTEXT NULL,
  tokens_used INT NULL,
  duration_ms INT NULL,
  status ENUM('success', 'failed') NOT NULL DEFAULT 'success',
  error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_logs_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_ai_logs_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 11. feedback
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (

-- ------------------------------------------------------------
-- 12. settings  (konfigurasi runtime — mis. API key & model LLM)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
