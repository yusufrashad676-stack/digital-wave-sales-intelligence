-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceOwnerModel" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "RoleKind" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('CREATED', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('PLATFORM', 'SCOPED');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('INTRODUCED', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PermissionGroupKind" AS ENUM ('DOMAIN', 'CAPABILITY_LEVEL');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DORMANT');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'REGISTERED',
    "preferences" JSONB,
    "last_login_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "owner_model" "WorkspaceOwnerModel" NOT NULL DEFAULT 'SINGLE',
    "default_settings" JSONB,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(2000),
    "kind" "RoleKind" NOT NULL DEFAULT 'CUSTOM',
    "status" "RoleStatus" NOT NULL DEFAULT 'CREATED',
    "parent_id" TEXT,
    "workspace_id" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "group_id" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'PLATFORM',
    "description" VARCHAR(2000),
    "status" "PermissionStatus" NOT NULL DEFAULT 'INTRODUCED',
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_workspaces" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "user_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_method_types" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contact_method_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_platforms" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "social_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_levels" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "role_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_groups" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "kind" "PermissionGroupKind" NOT NULL DEFAULT 'DOMAIN',
    "description" VARCHAR(2000),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "permission_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "trading_name" VARCHAR(255),
    "registration_number" VARCHAR(128),
    "tax_vat_id" VARCHAR(128),
    "jurisdiction" VARCHAR(2),
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_canonical" BOOLEAN NOT NULL DEFAULT false,
    "anonymized_at" TIMESTAMPTZ,
    "anonymization_token_id" VARCHAR(128),
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "branch_code" VARCHAR(128),
    "is_hq" BOOLEAN NOT NULL DEFAULT false,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "middle_name" VARCHAR(255),
    "display_name" VARCHAR(255),
    "preferred_language" VARCHAR(16),
    "photo_url" VARCHAR(2048),
    "anonymized_at" TIMESTAMPTZ,
    "anonymization_token_id" VARCHAR(128),
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "street_line_1" VARCHAR(255),
    "street_line_2" VARCHAR(255),
    "postal_code" VARCHAR(32),
    "city" VARCHAR(128),
    "region" VARCHAR(128),
    "country_code" VARCHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "formatted" VARCHAR(1024),
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websites" (
    "id" TEXT NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "url" VARCHAR(2048),
    "title" VARCHAR(500),
    "description" VARCHAR(2000),
    "tech_hints" JSONB,
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "handle" VARCHAR(255),
    "profile_url" VARCHAR(2048),
    "platform_profile_id" VARCHAR(255),
    "display_name" VARCHAR(255),
    "activity_snapshot" JSONB,
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_methods" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "country_code" VARCHAR(5),
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "color" VARCHAR(32),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "description" VARCHAR(2000),
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employments" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "department" VARCHAR(255),
    "role_level_id" TEXT,
    "started_at" DATE NOT NULL,
    "left_at" DATE,
    "import_source_ref" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_addresses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "role" VARCHAR(64) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "company_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_addresses" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "role" VARCHAR(64) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "branch_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_contact_methods" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "contact_method_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "suppressed_at" TIMESTAMPTZ,
    "suppression_reason" VARCHAR(500),
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "person_contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contact_methods" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_method_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "suppressed_at" TIMESTAMPTZ,
    "suppression_reason" VARCHAR(500),
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "company_contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_contact_methods" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "contact_method_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "suppressed_at" TIMESTAMPTZ,
    "suppression_reason" VARCHAR(500),
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "branch_contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_websites" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "company_websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_websites" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "website_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "branch_websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_social_profiles" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "social_profile_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "person_social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_social_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "social_profile_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "company_social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_social_profiles" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "social_profile_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "branch_social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_tags" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "source" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "company_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_tags" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "source" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "person_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_categories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ,
    "source" VARCHAR(255),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "company_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "users"("status");

-- CreateIndex
CREATE INDEX "idx_users_last_login_at" ON "users"("last_login_at");

-- CreateIndex
CREATE INDEX "idx_users_created_by_id" ON "users"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_users_updated_by_id" ON "users"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_users_deleted_by_id" ON "users"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_workspaces_code" ON "workspaces"("code");

-- CreateIndex
CREATE INDEX "idx_workspaces_status" ON "workspaces"("status");

-- CreateIndex
CREATE INDEX "idx_workspaces_created_by_id" ON "workspaces"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_workspaces_updated_by_id" ON "workspaces"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_workspaces_deleted_by_id" ON "workspaces"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_roles_code" ON "roles"("code");

-- CreateIndex
CREATE INDEX "idx_roles_status" ON "roles"("status");

-- CreateIndex
CREATE INDEX "idx_roles_parent_id" ON "roles"("parent_id");

-- CreateIndex
CREATE INDEX "idx_roles_workspace_id" ON "roles"("workspace_id");

-- CreateIndex
CREATE INDEX "idx_roles_created_by_id" ON "roles"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_roles_updated_by_id" ON "roles"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_roles_deleted_by_id" ON "roles"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_permissions_code" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "idx_permissions_group_id" ON "permissions"("group_id");

-- CreateIndex
CREATE INDEX "idx_permissions_status" ON "permissions"("status");

-- CreateIndex
CREATE INDEX "idx_permissions_created_by_id" ON "permissions"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_permissions_updated_by_id" ON "permissions"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_permissions_deleted_by_id" ON "permissions"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_role_assignments_user_id" ON "role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "idx_role_assignments_role_id" ON "role_assignments"("role_id");

-- CreateIndex
CREATE INDEX "idx_role_assignments_assigned_by_id" ON "role_assignments"("assigned_by_id");

-- CreateIndex
CREATE INDEX "idx_role_assignments_created_by_id" ON "role_assignments"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_role_assignments_updated_by_id" ON "role_assignments"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_role_assignments_deleted_by_id" ON "role_assignments"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_assignments_user_id_role_id" ON "role_assignments"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "idx_role_permissions_role_id" ON "role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "idx_role_permissions_permission_id" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "idx_role_permissions_assigned_by_id" ON "role_permissions"("assigned_by_id");

-- CreateIndex
CREATE INDEX "idx_role_permissions_created_by_id" ON "role_permissions"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_role_permissions_updated_by_id" ON "role_permissions"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_role_permissions_deleted_by_id" ON "role_permissions"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_permissions_role_id_permission_id" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "idx_user_workspaces_user_id" ON "user_workspaces"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_workspaces_workspace_id" ON "user_workspaces"("workspace_id");

-- CreateIndex
CREATE INDEX "idx_user_workspaces_assigned_by_id" ON "user_workspaces"("assigned_by_id");

-- CreateIndex
CREATE INDEX "idx_user_workspaces_created_by_id" ON "user_workspaces"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_user_workspaces_updated_by_id" ON "user_workspaces"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_user_workspaces_deleted_by_id" ON "user_workspaces"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_workspaces_user_id_workspace_id" ON "user_workspaces"("user_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contact_method_types_code" ON "contact_method_types"("code");

-- CreateIndex
CREATE INDEX "idx_contact_method_types_is_active" ON "contact_method_types"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_social_platforms_code" ON "social_platforms"("code");

-- CreateIndex
CREATE INDEX "idx_social_platforms_is_active" ON "social_platforms"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_levels_code" ON "role_levels"("code");

-- CreateIndex
CREATE INDEX "idx_role_levels_is_active" ON "role_levels"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_permission_groups_code" ON "permission_groups"("code");

-- CreateIndex
CREATE INDEX "idx_permission_groups_is_active" ON "permission_groups"("is_active");

-- CreateIndex
CREATE INDEX "idx_companies_name" ON "companies"("name");

-- CreateIndex
CREATE INDEX "idx_companies_jurisdiction_registration_number" ON "companies"("jurisdiction", "registration_number");

-- CreateIndex
CREATE INDEX "idx_companies_status" ON "companies"("status");

-- CreateIndex
CREATE INDEX "idx_companies_created_at" ON "companies"("created_at");

-- CreateIndex
CREATE INDEX "idx_companies_created_by_id" ON "companies"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_companies_updated_by_id" ON "companies"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_companies_deleted_by_id" ON "companies"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_branches_company_id" ON "branches"("company_id");

-- CreateIndex
CREATE INDEX "idx_branches_company_id_name" ON "branches"("company_id", "name");

-- CreateIndex
CREATE INDEX "idx_branches_is_hq" ON "branches"("is_hq");

-- CreateIndex
CREATE INDEX "idx_branches_status" ON "branches"("status");

-- CreateIndex
CREATE INDEX "idx_branches_created_by_id" ON "branches"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_branches_updated_by_id" ON "branches"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_branches_deleted_by_id" ON "branches"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_people_last_name_first_name" ON "people"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "idx_people_first_name_last_name" ON "people"("first_name", "last_name");

-- CreateIndex
CREATE INDEX "idx_people_created_at" ON "people"("created_at");

-- CreateIndex
CREATE INDEX "idx_people_anonymized_at" ON "people"("anonymized_at");

-- CreateIndex
CREATE INDEX "idx_people_created_by_id" ON "people"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_people_updated_by_id" ON "people"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_people_deleted_by_id" ON "people"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_addresses_country_code_postal_code" ON "addresses"("country_code", "postal_code");

-- CreateIndex
CREATE INDEX "idx_addresses_country_code_city" ON "addresses"("country_code", "city");

-- CreateIndex
CREATE INDEX "idx_addresses_latitude_longitude" ON "addresses"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "idx_addresses_created_by_id" ON "addresses"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_addresses_updated_by_id" ON "addresses"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_addresses_deleted_by_id" ON "addresses"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_websites_domain" ON "websites"("domain");

-- CreateIndex
CREATE INDEX "idx_websites_created_by_id" ON "websites"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_websites_updated_by_id" ON "websites"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_websites_deleted_by_id" ON "websites"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_social_profiles_platform_profile_id" ON "social_profiles"("platform_id", "platform_profile_id");

-- CreateIndex
CREATE INDEX "idx_social_profiles_platform_handle" ON "social_profiles"("platform_id", "handle");

-- CreateIndex
CREATE INDEX "idx_social_profiles_created_by_id" ON "social_profiles"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_social_profiles_updated_by_id" ON "social_profiles"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_social_profiles_deleted_by_id" ON "social_profiles"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_contact_methods_type_value" ON "contact_methods"("type_id", "value");

-- CreateIndex
CREATE INDEX "idx_contact_methods_created_by_id" ON "contact_methods"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_contact_methods_updated_by_id" ON "contact_methods"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_contact_methods_deleted_by_id" ON "contact_methods"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_tags_name" ON "tags"("name");

-- CreateIndex
CREATE INDEX "idx_tags_created_by_id" ON "tags"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_tags_updated_by_id" ON "tags"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_tags_deleted_by_id" ON "tags"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_categories_code" ON "categories"("code");

-- CreateIndex
CREATE INDEX "idx_categories_parent_id" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "idx_categories_is_active" ON "categories"("is_active");

-- CreateIndex
CREATE INDEX "idx_categories_created_by_id" ON "categories"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_categories_updated_by_id" ON "categories"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_categories_deleted_by_id" ON "categories"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_employments_person_id_left_at" ON "employments"("person_id", "left_at");

-- CreateIndex
CREATE INDEX "idx_employments_company_id" ON "employments"("company_id");

-- CreateIndex
CREATE INDEX "idx_employments_company_id_left_at" ON "employments"("company_id", "left_at");

-- CreateIndex
CREATE INDEX "idx_employments_branch_id" ON "employments"("branch_id");

-- CreateIndex
CREATE INDEX "idx_employments_person_id_company_id" ON "employments"("person_id", "company_id");

-- CreateIndex
CREATE INDEX "idx_employments_role_level_id" ON "employments"("role_level_id");

-- CreateIndex
CREATE INDEX "idx_employments_created_by_id" ON "employments"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_employments_updated_by_id" ON "employments"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_employments_deleted_by_id" ON "employments"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_company_addresses_company_id" ON "company_addresses"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_addresses_address_id" ON "company_addresses"("address_id");

-- CreateIndex
CREATE INDEX "idx_company_addresses_company_role_primary" ON "company_addresses"("company_id", "role", "is_primary");

-- CreateIndex
CREATE INDEX "idx_company_addresses_created_by_id" ON "company_addresses"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_company_addresses_updated_by_id" ON "company_addresses"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_company_addresses_deleted_by_id" ON "company_addresses"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_addresses_company_id_address_id_role" ON "company_addresses"("company_id", "address_id", "role");

-- CreateIndex
CREATE INDEX "idx_branch_addresses_branch_id" ON "branch_addresses"("branch_id");

-- CreateIndex
CREATE INDEX "idx_branch_addresses_address_id" ON "branch_addresses"("address_id");

-- CreateIndex
CREATE INDEX "idx_branch_addresses_branch_role_primary" ON "branch_addresses"("branch_id", "role", "is_primary");

-- CreateIndex
CREATE INDEX "idx_branch_addresses_created_by_id" ON "branch_addresses"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_addresses_updated_by_id" ON "branch_addresses"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_addresses_deleted_by_id" ON "branch_addresses"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_branch_addresses_branch_id_address_id_role" ON "branch_addresses"("branch_id", "address_id", "role");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_person_id" ON "person_contact_methods"("person_id");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_contact_method_id" ON "person_contact_methods"("contact_method_id");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_person_primary" ON "person_contact_methods"("person_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_suppressed_at" ON "person_contact_methods"("suppressed_at");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_created_by_id" ON "person_contact_methods"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_updated_by_id" ON "person_contact_methods"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_person_contact_methods_deleted_by_id" ON "person_contact_methods"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_person_contact_methods_person_id_contact_method_id" ON "person_contact_methods"("person_id", "contact_method_id");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_company_id" ON "company_contact_methods"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_contact_method_id" ON "company_contact_methods"("contact_method_id");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_company_primary" ON "company_contact_methods"("company_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_suppressed_at" ON "company_contact_methods"("suppressed_at");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_created_by_id" ON "company_contact_methods"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_updated_by_id" ON "company_contact_methods"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_company_contact_methods_deleted_by_id" ON "company_contact_methods"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_contact_methods_company_id_contact_method_id" ON "company_contact_methods"("company_id", "contact_method_id");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_branch_id" ON "branch_contact_methods"("branch_id");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_contact_method_id" ON "branch_contact_methods"("contact_method_id");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_branch_primary" ON "branch_contact_methods"("branch_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_suppressed_at" ON "branch_contact_methods"("suppressed_at");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_created_by_id" ON "branch_contact_methods"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_updated_by_id" ON "branch_contact_methods"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_contact_methods_deleted_by_id" ON "branch_contact_methods"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_branch_contact_methods_branch_id_contact_method_id" ON "branch_contact_methods"("branch_id", "contact_method_id");

-- CreateIndex
CREATE INDEX "idx_company_websites_company_id" ON "company_websites"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_websites_website_id" ON "company_websites"("website_id");

-- CreateIndex
CREATE INDEX "idx_company_websites_company_primary" ON "company_websites"("company_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_company_websites_created_by_id" ON "company_websites"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_company_websites_updated_by_id" ON "company_websites"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_company_websites_deleted_by_id" ON "company_websites"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_websites_company_id_website_id" ON "company_websites"("company_id", "website_id");

-- CreateIndex
CREATE INDEX "idx_branch_websites_branch_id" ON "branch_websites"("branch_id");

-- CreateIndex
CREATE INDEX "idx_branch_websites_website_id" ON "branch_websites"("website_id");

-- CreateIndex
CREATE INDEX "idx_branch_websites_branch_primary" ON "branch_websites"("branch_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_branch_websites_created_by_id" ON "branch_websites"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_websites_updated_by_id" ON "branch_websites"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_websites_deleted_by_id" ON "branch_websites"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_branch_websites_branch_id_website_id" ON "branch_websites"("branch_id", "website_id");

-- CreateIndex
CREATE INDEX "idx_person_social_profiles_person_id" ON "person_social_profiles"("person_id");

-- CreateIndex
CREATE INDEX "idx_person_social_profiles_social_profile_id" ON "person_social_profiles"("social_profile_id");

-- CreateIndex
CREATE INDEX "idx_person_social_profiles_person_primary" ON "person_social_profiles"("person_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_person_social_profiles_created_by_id" ON "person_social_profiles"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_person_social_profiles_updated_by_id" ON "person_social_profiles"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_person_social_profiles_deleted_by_id" ON "person_social_profiles"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_person_social_profiles_person_id_social_profile_id" ON "person_social_profiles"("person_id", "social_profile_id");

-- CreateIndex
CREATE INDEX "idx_company_social_profiles_company_id" ON "company_social_profiles"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_social_profiles_social_profile_id" ON "company_social_profiles"("social_profile_id");

-- CreateIndex
CREATE INDEX "idx_company_social_profiles_company_primary" ON "company_social_profiles"("company_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_company_social_profiles_created_by_id" ON "company_social_profiles"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_company_social_profiles_updated_by_id" ON "company_social_profiles"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_company_social_profiles_deleted_by_id" ON "company_social_profiles"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_social_profiles_company_id_social_profile_id" ON "company_social_profiles"("company_id", "social_profile_id");

-- CreateIndex
CREATE INDEX "idx_branch_social_profiles_branch_id" ON "branch_social_profiles"("branch_id");

-- CreateIndex
CREATE INDEX "idx_branch_social_profiles_social_profile_id" ON "branch_social_profiles"("social_profile_id");

-- CreateIndex
CREATE INDEX "idx_branch_social_profiles_branch_primary" ON "branch_social_profiles"("branch_id", "is_primary");

-- CreateIndex
CREATE INDEX "idx_branch_social_profiles_created_by_id" ON "branch_social_profiles"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_social_profiles_updated_by_id" ON "branch_social_profiles"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_branch_social_profiles_deleted_by_id" ON "branch_social_profiles"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_branch_social_profiles_branch_id_social_profile_id" ON "branch_social_profiles"("branch_id", "social_profile_id");

-- CreateIndex
CREATE INDEX "idx_company_tags_company_id" ON "company_tags"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_tags_tag_id" ON "company_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_company_tags_assigned_at" ON "company_tags"("assigned_at");

-- CreateIndex
CREATE INDEX "idx_company_tags_created_by_id" ON "company_tags"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_company_tags_updated_by_id" ON "company_tags"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_company_tags_deleted_by_id" ON "company_tags"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_tags_company_id_tag_id" ON "company_tags"("company_id", "tag_id");

-- CreateIndex
CREATE INDEX "idx_person_tags_person_id" ON "person_tags"("person_id");

-- CreateIndex
CREATE INDEX "idx_person_tags_tag_id" ON "person_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_person_tags_assigned_at" ON "person_tags"("assigned_at");

-- CreateIndex
CREATE INDEX "idx_person_tags_created_by_id" ON "person_tags"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_person_tags_updated_by_id" ON "person_tags"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_person_tags_deleted_by_id" ON "person_tags"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_person_tags_person_id_tag_id" ON "person_tags"("person_id", "tag_id");

-- CreateIndex
CREATE INDEX "idx_company_categories_company_id" ON "company_categories"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_categories_category_id" ON "company_categories"("category_id");

-- CreateIndex
CREATE INDEX "idx_company_categories_created_by_id" ON "company_categories"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_company_categories_updated_by_id" ON "company_categories"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_company_categories_deleted_by_id" ON "company_categories"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_categories_company_id_category_id" ON "company_categories"("company_id", "category_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "permission_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_workspaces" ADD CONSTRAINT "user_workspaces_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "social_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "contact_method_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_role_level_id_fkey" FOREIGN KEY ("role_level_id") REFERENCES "role_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employments" ADD CONSTRAINT "employments_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_addresses" ADD CONSTRAINT "branch_addresses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_addresses" ADD CONSTRAINT "branch_addresses_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_addresses" ADD CONSTRAINT "branch_addresses_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_addresses" ADD CONSTRAINT "branch_addresses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_addresses" ADD CONSTRAINT "branch_addresses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_addresses" ADD CONSTRAINT "branch_addresses_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contact_methods" ADD CONSTRAINT "person_contact_methods_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contact_methods" ADD CONSTRAINT "person_contact_methods_contact_method_id_fkey" FOREIGN KEY ("contact_method_id") REFERENCES "contact_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contact_methods" ADD CONSTRAINT "person_contact_methods_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contact_methods" ADD CONSTRAINT "person_contact_methods_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contact_methods" ADD CONSTRAINT "person_contact_methods_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_contact_methods" ADD CONSTRAINT "person_contact_methods_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_methods" ADD CONSTRAINT "company_contact_methods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_methods" ADD CONSTRAINT "company_contact_methods_contact_method_id_fkey" FOREIGN KEY ("contact_method_id") REFERENCES "contact_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_methods" ADD CONSTRAINT "company_contact_methods_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_methods" ADD CONSTRAINT "company_contact_methods_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_methods" ADD CONSTRAINT "company_contact_methods_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_methods" ADD CONSTRAINT "company_contact_methods_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_contact_methods" ADD CONSTRAINT "branch_contact_methods_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_contact_methods" ADD CONSTRAINT "branch_contact_methods_contact_method_id_fkey" FOREIGN KEY ("contact_method_id") REFERENCES "contact_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_contact_methods" ADD CONSTRAINT "branch_contact_methods_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_contact_methods" ADD CONSTRAINT "branch_contact_methods_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_contact_methods" ADD CONSTRAINT "branch_contact_methods_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_contact_methods" ADD CONSTRAINT "branch_contact_methods_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_websites" ADD CONSTRAINT "company_websites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_websites" ADD CONSTRAINT "company_websites_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_websites" ADD CONSTRAINT "company_websites_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_websites" ADD CONSTRAINT "company_websites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_websites" ADD CONSTRAINT "company_websites_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_websites" ADD CONSTRAINT "company_websites_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_websites" ADD CONSTRAINT "branch_websites_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_websites" ADD CONSTRAINT "branch_websites_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_websites" ADD CONSTRAINT "branch_websites_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_websites" ADD CONSTRAINT "branch_websites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_websites" ADD CONSTRAINT "branch_websites_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_websites" ADD CONSTRAINT "branch_websites_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_social_profiles" ADD CONSTRAINT "person_social_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_social_profiles" ADD CONSTRAINT "person_social_profiles_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_social_profiles" ADD CONSTRAINT "person_social_profiles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_social_profiles" ADD CONSTRAINT "person_social_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_social_profiles" ADD CONSTRAINT "person_social_profiles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_social_profiles" ADD CONSTRAINT "person_social_profiles_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_profiles" ADD CONSTRAINT "company_social_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_profiles" ADD CONSTRAINT "company_social_profiles_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_profiles" ADD CONSTRAINT "company_social_profiles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_profiles" ADD CONSTRAINT "company_social_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_profiles" ADD CONSTRAINT "company_social_profiles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_profiles" ADD CONSTRAINT "company_social_profiles_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_social_profiles" ADD CONSTRAINT "branch_social_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_social_profiles" ADD CONSTRAINT "branch_social_profiles_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_social_profiles" ADD CONSTRAINT "branch_social_profiles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_social_profiles" ADD CONSTRAINT "branch_social_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_social_profiles" ADD CONSTRAINT "branch_social_profiles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_social_profiles" ADD CONSTRAINT "branch_social_profiles_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
