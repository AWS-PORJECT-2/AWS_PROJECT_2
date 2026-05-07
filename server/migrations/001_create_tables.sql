CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE allowed_domain (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), domain VARCHAR(255) NOT NULL UNIQUE, school_name VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE "user" (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, school_domain VARCHAR(255) NOT NULL, picture VARCHAR(512), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE oauth_state (state VARCHAR(255) PRIMARY KEY, remember_me BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE refresh_token (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, token VARCHAR(512) NOT NULL UNIQUE, remember_me BOOLEAN NOT NULL DEFAULT FALSE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX idx_user_email ON "user" (email);
CREATE INDEX idx_refresh_token_user_id ON refresh_token (user_id);
CREATE INDEX idx_refresh_token_token ON refresh_token (token);
