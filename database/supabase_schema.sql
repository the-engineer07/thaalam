-- ==============================================================================
-- THAALAM PLATFORM - SUPABASE DATABASE INITIALIZATION & VERIFIED SEED SCHEMA
-- Synchronized with:
--   1. companies/Business_Directory.html (businesses table)
--   2. resources/Find Professionals.html (professionals table)
--   3. thaalam/trusted_partners.html (partners table)
--   4. admin/index.html & admin/admin.js (Administrative sync & review)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE: businesses (For Business_Directory.html)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    logo_url TEXT DEFAULT 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100&auto=format&fit=crop',
    founder TEXT,
    established_year INTEGER,
    industry_category TEXT,
    sector TEXT NOT NULL,
    sub_category TEXT,
    services_products TEXT,
    company_type TEXT,
    gst_number TEXT,
    email TEXT,
    phone TEXT,
    service_area TEXT,
    address TEXT,
    description TEXT,
    website_url TEXT,
    instagram_url TEXT,
    linkedin_url TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. TABLE: professionals (For Find Professionals.html & Register.html)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fullname TEXT NOT NULL,
    profile_photo TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop',
    professional_title TEXT NOT NULL,
    location TEXT NOT NULL,
    category TEXT NOT NULL,
    specialization TEXT,
    industry_experience TEXT,
    experience_years INTEGER DEFAULT 0,
    current_organization TEXT,
    designation TEXT,
    skills TEXT,
    qualification TEXT,
    languages TEXT,
    availability TEXT,
    email TEXT DEFAULT '',
    phone TEXT,
    website TEXT,
    linkedin TEXT,
    instagram TEXT,
    terms_agreed BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 4. TABLE: partners (For trusted_partners.html)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name TEXT NOT NULL,
    partner_type TEXT NOT NULL,
    category TEXT,
    contact_person TEXT NOT NULL,
    designation TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    location TEXT,
    website_url TEXT,
    logo_url TEXT DEFAULT 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200&auto=format&fit=crop',
    description TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 5. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_businesses_sector ON public.businesses(sector);
CREATE INDEX IF NOT EXISTS idx_businesses_company_type ON public.businesses(company_type);
CREATE INDEX IF NOT EXISTS idx_businesses_approved ON public.businesses(is_approved);
CREATE INDEX IF NOT EXISTS idx_businesses_created ON public.businesses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_professionals_category ON public.professionals(category);
CREATE INDEX IF NOT EXISTS idx_professionals_location ON public.professionals(location);
CREATE INDEX IF NOT EXISTS idx_professionals_experience ON public.professionals(experience_years);
CREATE INDEX IF NOT EXISTS idx_professionals_approved ON public.professionals(is_approved);
CREATE INDEX IF NOT EXISTS idx_professionals_created ON public.professionals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partners_category ON public.partners(category);
CREATE INDEX IF NOT EXISTS idx_partners_approved ON public.partners(is_approved);
CREATE INDEX IF NOT EXISTS idx_partners_created ON public.partners(created_at DESC);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- 6.1 BUSINESSES POLICIES
CREATE POLICY "Public can view approved businesses" 
ON public.businesses FOR SELECT 
USING (is_approved = TRUE);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'businesses'
          AND policyname = 'Public can submit pending businesses'
    ) THEN
        CREATE POLICY "Public can submit pending businesses"
        ON public.businesses FOR INSERT TO anon
        WITH CHECK (is_approved = FALSE);
    END IF;
END $$;

-- Allow anon (admin panel) to update any business row (approval toggle)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'businesses'
          AND policyname = 'Anon admin can update businesses'
    ) THEN
        CREATE POLICY "Anon admin can update businesses"
        ON public.businesses FOR UPDATE TO anon
        USING (TRUE) WITH CHECK (TRUE);
    END IF;
END $$;

CREATE POLICY "Authenticated users can manage businesses" 
ON public.businesses FOR ALL 
TO authenticated 
USING (TRUE) WITH CHECK (TRUE);

-- 6.2 PROFESSIONALS POLICIES
CREATE POLICY "Public can view approved professionals" 
ON public.professionals FOR SELECT 
USING (is_approved = TRUE);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'professionals'
          AND policyname = 'Public can submit pending professionals'
    ) THEN
        CREATE POLICY "Public can submit pending professionals"
        ON public.professionals FOR INSERT TO anon
        WITH CHECK (is_approved = FALSE);
    END IF;
END $$;

-- Allow anon (admin panel) to update any professional row (approval toggle)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'professionals'
          AND policyname = 'Anon admin can update professionals'
    ) THEN
        CREATE POLICY "Anon admin can update professionals"
        ON public.professionals FOR UPDATE TO anon
        USING (TRUE) WITH CHECK (TRUE);
    END IF;
END $$;

CREATE POLICY "Authenticated users can manage professionals" 
ON public.professionals FOR ALL 
TO authenticated 
USING (TRUE) WITH CHECK (TRUE);

-- 6.3 PARTNERS POLICIES
CREATE POLICY "Public can view approved partners" 
ON public.partners FOR SELECT 
USING (is_approved = TRUE);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'partners'
          AND policyname = 'Public can submit pending partners'
    ) THEN
        CREATE POLICY "Public can submit pending partners"
        ON public.partners FOR INSERT TO anon
        WITH CHECK (is_approved = FALSE);
    END IF;
END $$;

-- Allow anon (admin panel) to update any partner row (approval toggle)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'partners'
          AND policyname = 'Anon admin can update partners'
    ) THEN
        CREATE POLICY "Anon admin can update partners"
        ON public.partners FOR UPDATE TO anon
        USING (TRUE) WITH CHECK (TRUE);
    END IF;
END $$;

CREATE POLICY "Authenticated users can manage partners" 
ON public.partners FOR ALL 
TO authenticated 
USING (TRUE) WITH CHECK (TRUE);

-- ==============================================================================
-- 7. AUTO-UPDATE UPDATED_AT TRIGGERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_businesses_updated_at ON public.businesses;
CREATE TRIGGER trigger_update_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_professionals_updated_at ON public.professionals;
CREATE TRIGGER trigger_update_professionals_updated_at
BEFORE UPDATE ON public.professionals
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_partners_updated_at ON public.partners;
CREATE TRIGGER trigger_update_partners_updated_at
BEFORE UPDATE ON public.partners
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ==============================================================================
-- 8. SCHEMAS READY FOR LIVE SUBMISSIONS
-- ==============================================================================

-- Fix is_approved defaults on existing tables (run if tables already exist)
ALTER TABLE public.businesses ALTER COLUMN is_approved SET DEFAULT FALSE;
ALTER TABLE public.professionals ALTER COLUMN is_approved SET DEFAULT FALSE;
ALTER TABLE public.partners ALTER COLUMN is_approved SET DEFAULT FALSE;

-- ==============================================================================
-- MIGRATION: Add / Remove columns for existing live tables
-- Run this block in Supabase SQL Editor if tables were already created
-- ==============================================================================


-- Ensure description exists in businesses
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'description'
    ) THEN
        ALTER TABLE public.businesses ADD COLUMN description TEXT DEFAULT '';
    END IF;
END $$;

-- Ensure email exists in professionals
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'email'
    ) THEN
        ALTER TABLE public.professionals ADD COLUMN email TEXT DEFAULT '';
    END IF;
END $$;

-- Drop unused social media columns from professionals (if they exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'twitter') THEN
        ALTER TABLE public.professionals DROP COLUMN twitter;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'youtube') THEN
        ALTER TABLE public.professionals DROP COLUMN youtube;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'portfolio') THEN
        ALTER TABLE public.professionals DROP COLUMN portfolio;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'social_media') THEN
        ALTER TABLE public.professionals DROP COLUMN social_media;
    END IF;
END $$;

-- 9. PUBLIC FILE STORAGE FOR REGISTRATION UPLOADS
INSERT INTO storage.buckets (id, name, public)
VALUES ('thaalam-uploads', 'thaalam-uploads', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can upload Thaalam registration files') THEN
        CREATE POLICY "Public can upload Thaalam registration files"
        ON storage.objects FOR INSERT TO anon
        WITH CHECK (bucket_id = 'thaalam-uploads');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can view Thaalam registration files') THEN
        CREATE POLICY "Public can view Thaalam registration files"
        ON storage.objects FOR SELECT TO anon
        USING (bucket_id = 'thaalam-uploads');
    END IF;
END
$$;
