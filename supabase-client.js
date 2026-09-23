/**
 * THAALAM PLATFORM - SUPABASE CLIENT INTEGRATION
 * Secure client-side communication with Supabase database
 * 
 * IMPORTANT: Only use the PUBLIC ANON KEY here.
 * Never put your service_role secret key in frontend code!
 */

// ==============================================================================
// 1. CONFIGURATION - REPLACE WITH YOUR SUPABASE PROJECT CREDENTIALS
// Find these in: Supabase Dashboard -> Project Settings -> API
// ==============================================================================
const SUPABASE_CONFIG = {
    url: 'https://djdycmztzqxpngveojyn.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZHljbXp0enF4cG5ndmVvanluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTM2MjAsImV4cCI6MjEwNTQ2OTYyMH0.J-1DdK-NBEzRRdXCxdK8AYOcA_C8hPMErppN9pETQxc'
};

// ==============================================================================
// 2. CLIENT INITIALIZATION
// ==============================================================================
let _supabaseClient = null;

function getSupabase() {
    if (_supabaseClient) return _supabaseClient;

    // Verify configuration is set
    if (!SUPABASE_CONFIG.url || SUPABASE_CONFIG.url.includes('YOUR_SUPABASE') ||
        !SUPABASE_CONFIG.anonKey || SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE')) {
        console.info('[Thalam Supabase] Credentials not configured yet. Using static fallback data.');
        return null;
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
        _supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
            global: {
                headers: { 'x-client-info': 'thalam-web/1.0' }
            },
            db: { schema: 'public' },
            auth: { persistSession: false }
        });
        return _supabaseClient;
    } else {
        console.warn('[Thalam Supabase] Supabase JS library not loaded. Make sure to include @supabase/supabase-js CDN.');
        return null;
    }
}

/**
 * Wraps a Supabase query promise with a timeout.
 * If the query takes longer than `ms` milliseconds, rejects with a timeout error.
 */
function withTimeout(promise, ms = 8000) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Supabase query timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
}

// ==============================================================================
// 3. BUSINESS DIRECTORY API (For Business_Directory.html)
// ==============================================================================
const ThalamBusinesses = {
    /**
     * Remove only repeated database rows; different businesses may share names or contact details.
     */
    deduplicate(list) {
        if (!Array.isArray(list)) return [];
        const seenIds = new Set();
        return list.filter(b => {
            if (!b) return false;
            if (b.id === undefined || b.id === null || b.id === '') return true;
            if (seenIds.has(String(b.id))) return false;
            seenIds.add(String(b.id));
            return true;
        });
    },

    /**
     * Fetch approved businesses from Supabase (or cached local approved)
     */
    async fetchAll() {
        let localList = [];
        try {
            const stored = localStorage.getItem('thalam_admin_businesses');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    localList = parsed.filter(b => b.is_approved);
                }
            }
        } catch (e) {}

        const client = getSupabase();
        if (client) {
            try {
                const query = client
                    .from('businesses')
                    .select('*')
                    .eq('is_approved', true)
                    .order('created_at', { ascending: false });

                const { data, error } = await withTimeout(query);

                if (!error && data && data.length > 0) {
                    return this.deduplicate(data);
                }
                if (error) console.warn('[Thalam Supabase] Businesses fetch error:', error.message);
            } catch (err) {
                console.warn('[Thalam Supabase] Remote businesses fetch skipped, using local data.', err.message);
            }
        }
        return this.deduplicate(localList);
    },

    async fetchPage(page = 0, pageSize = 100) {
        const client = getSupabase();
        if (!client) return { data: await this.fetchAll(), hasMore: false };

        try {
            const start = page * pageSize;
            const query = client
                .from('businesses')
                .select('*')
                .eq('is_approved', true)
                .order('created_at', { ascending: false })
                .range(start, start + pageSize - 1);

            const { data, error } = await withTimeout(query);

            if (error) throw error;
            return { data: this.deduplicate(data || []), hasMore: (data || []).length === pageSize };
        } catch (error) {
            console.warn('[Thalam Supabase] Business page fetch failed:', error.message);
            return { data: await this.fetchAll(), hasMore: false };
        }
    },

    /**
     * Dynamic Renderer for Business_Directory.html table
     */
    async loadIntoTable(tableBodyId = 'directoryTableBody') {
        const rawBusinesses = await this.fetchAll();
        const businesses = this.deduplicate(rawBusinesses);
        const tbody = document.querySelector(`#directoryTable tbody`) || document.getElementById(tableBodyId);
        const countEl = document.getElementById('recordCount');

        if (!businesses || businesses.length === 0) {
            if (tbody) {
                tbody.innerHTML = `<tr id="emptyStateRow"><td colspan="8" style="text-align: center; padding: 48px 20px; color: #64748b;"><div style="font-size: 16px; font-weight: 600; color: #334155; margin-bottom: 6px;">No business listings found</div><div style="font-size: 13.5px;">Submit your business via <a href="Launch_Your_Company.html" style="color: #dc2626; font-weight: 600; text-decoration: underline;">Launch Your Company</a> or Admin Panel to populate this directory.</div></td></tr>`;
            }
            if (countEl) countEl.innerText = '0';
            return true;
        }

        if (!tbody) return false;

        window.__thalam_bizList = businesses;
        window.__thalam_openBizModal = function(index) {
            const b = (window.__thalam_bizList && window.__thalam_bizList[index]) || {};
            if (typeof openModal === 'function') {
                openModal(
                    b.company_name || '',
                    b.industry_category || '',
                    b.sector || '',
                    b.sub_category || '',
                    b.description || '',
                    b.company_type || '',
                    b.gst_number || '',
                    b.email || '',
                    b.phone || '',
                    b.service_area || '',
                    b.address || '',
                    b.instagram_url || '#',
                    b.website_url || '#',
                    b.linkedin_url || '#'
                );
            }
        };
        window.__thalam_openServicesModal = function(index) {
            const b = (window.__thalam_bizList && window.__thalam_bizList[index]) || {};
            if (typeof openServicesModal === 'function') {
                openServicesModal(
                    b.company_name || 'Company',
                    b.services_products || b.description || ''
                );
            }
        };

        tbody.innerHTML = businesses.map((b, index) => `
            <tr data-sector="${escapeHtml(b.sector || '')}" 
                data-category="${escapeHtml(b.industry_category || '')}" 
                data-company="${escapeHtml(b.company_name || '')}" 
                data-location="${escapeHtml(b.service_area || b.address || '')}"
                data-type="${escapeHtml(b.company_type || '')}">
                <td>
                    <div class="logo-box">
                        <img src="${escapeHtml(b.logo_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100&auto=format&fit=crop')}"
                            alt="${escapeHtml(b.company_name)} Logo">
                    </div>
                </td>
                <td class="company-name">${escapeHtml(b.company_name)}</td>
                <td>${escapeHtml(b.founder || 'N/A')}</td>
                <td>${escapeHtml(b.established_year ? String(b.established_year) : 'N/A')}</td>
                <td><span class="sector-badge">${escapeHtml(b.industry_category || b.sector || '')}</span></td>
                <td class="services-cell">
                    <span class="services-preview">${escapeHtml(b.services_products || b.description || 'No services or products listed.')}</span>
                    <button class="btn-view btn-services" onclick="window.__thalam_openServicesModal(${index})">View Services</button>
                </td>
                <td>${escapeHtml(b.address || 'N/A')}</td>
                <td>
                    <button class="btn-view" onclick="window.__thalam_openBizModal(${index})">View Details</button>
                </td>
            </tr>
        `).join('');

        // Update record count and trigger filter
        if (countEl) countEl.innerText = businesses.length;

        if (typeof filterTable === 'function') {
            filterTable();
        }

        return true;
    },

    /**
     * Submit new business registration (defaults to pending approval)
     */
    async register(bizData) {
        const client = getSupabase();
        // Always force is_approved to false — RLS INSERT policy only allows false
        const payload = {
            ...bizData,
            is_approved: false,
            created_at: new Date().toISOString()
        };

        // Also save to localStorage admin cache so admin panel sees it immediately
        try {
            const saved = localStorage.getItem('thalam_admin_businesses');
            let list = saved ? JSON.parse(saved) : [];
            const newEntry = {
                id: 'b-' + Date.now(),
                ...payload,
                logo_url: payload.logo_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100&auto=format&fit=crop'
            };
            list.unshift(newEntry);
            localStorage.setItem('thalam_admin_businesses', JSON.stringify(list));
        } catch (e) {
            console.warn('Local storage cache update failed:', e);
        }

        if (!client) return { success: true, localOnly: true };

        try {
            let existingId = null;
            if (payload.email) {
                const { data: byEmail } = await client
                    .from('businesses')
                    .select('id')
                    .ilike('email', payload.email.trim())
                    .limit(1);
                if (byEmail && byEmail.length > 0) existingId = byEmail[0].id;
            }
            if (!existingId && payload.company_name) {
                const { data: byName } = await client
                    .from('businesses')
                    .select('id')
                    .ilike('company_name', payload.company_name.trim())
                    .limit(1);
                if (byName && byName.length > 0) existingId = byName[0].id;
            }

            if (existingId) {
                const { data, error } = await client
                    .from('businesses')
                    .update(payload)
                    .eq('id', existingId)
                    .select();
                if (error) throw error;
                return { success: true, data };
            } else {
                const { data, error } = await client
                    .from('businesses')
                    .insert([payload])
                    .select();
                if (error) throw error;
                return { success: true, data };
            }
        } catch (err) {
            console.error('[Thalam Supabase] Error registering business:', err);
            return { success: true, localOnly: true, error: err };
        }
    }
};

// ==============================================================================
// 4. PROFESSIONALS DIRECTORY API (For Find Professionals.html & Register.html)
// ==============================================================================
const ThalamProfessionals = {
    /**
     * Remove only repeated database rows; different professionals may share names or contact details.
     */
    deduplicate(list) {
        if (!Array.isArray(list)) return [];
        const seenIds = new Set();
        return list.filter(p => {
            if (!p) return false;
            if (p.id === undefined || p.id === null || p.id === '') return true;
            if (seenIds.has(String(p.id))) return false;
            seenIds.add(String(p.id));
            return true;
        });
    },

    /**
     * Fetch approved professionals from Supabase
     */
    async fetchAll() {
        let localList = [];
        try {
            const stored = localStorage.getItem('thalam_admin_professionals');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    localList = parsed.filter(p => p.is_approved);
                }
            }
        } catch (e) {}

        const client = getSupabase();
        if (client) {
            try {
                const query = client
                    .from('professionals')
                    .select('*')
                    .eq('is_approved', true)
                    .order('created_at', { ascending: false });

                const { data, error } = await withTimeout(query);

                if (!error && data && data.length > 0) {
                    return this.deduplicate(data);
                }
                if (error) console.warn('[Thalam Supabase] Professionals fetch error:', error.message);
            } catch (err) {
                console.warn('[Thalam Supabase] Remote professionals fetch skipped, using local data.', err.message);
            }
        }
        return this.deduplicate(localList);
    },

    /**
     * Paginated fetch for professionals (used by loadIntoCards)
     */
    async fetchPage(page = 0, pageSize = 100) {
        const client = getSupabase();
        if (!client) return { data: await this.fetchAll(), hasMore: false };

        try {
            const start = page * pageSize;
            const query = client
                .from('professionals')
                .select('*')
                .eq('is_approved', true)
                .order('created_at', { ascending: false })
                .range(start, start + pageSize - 1);

            const { data, error } = await withTimeout(query);

            if (error) throw error;
            return { data: this.deduplicate(data || []), hasMore: (data || []).length === pageSize };
        } catch (err) {
            console.warn('[Thalam Supabase] Professional page fetch failed:', err.message);
            // Fallback to full local list on page 0 only
            if (page === 0) return { data: await this.fetchAll(), hasMore: false };
            return { data: [], hasMore: false };
        }
    },

    /**
     * Register a new professional directly into Supabase
     */
    async register(profileData) {
        const payload = {
            fullname: profileData.fullname,
            profile_photo: profileData.profile_photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop',
            professional_title: profileData.professional_title,
            location: profileData.location,
            category: profileData.category,
            specialization: profileData.specialization,
            industry_experience: profileData.industry_experience,
            experience_years: parseInt(String(profileData.experience || profileData.experience_years || '0').split('-')[0]) || 0,
            current_organization: profileData.current_organization,
            designation: profileData.designation,
            skills: profileData.skills,
            qualification: profileData.qualification,
            languages: profileData.languages,
            availability: profileData.availability,
            email: profileData.email || '',
            phone: profileData.phone,
            website: cleanUrl(profileData.website),
            linkedin: cleanUrl(profileData.linkedin),
            instagram: cleanUrl(profileData.instagram || ''),
            terms_agreed: Boolean(profileData.terms),
            is_approved: false,
            created_at: new Date().toISOString()
        };

        // Cache to localStorage for immediate admin review
        try {
            const saved = localStorage.getItem('thalam_admin_professionals');
            let list = saved ? JSON.parse(saved) : [];
            list.unshift({ id: 'p-' + Date.now(), ...payload });
            localStorage.setItem('thalam_admin_professionals', JSON.stringify(list));
        } catch (e) {
            console.warn('Local storage cache update failed for professional:', e);
        }

        const client = getSupabase();
        if (!client) return { success: true, localOnly: true, data: payload };

        try {
            let existingId = null;
            if (payload.email) {
                const { data: byEmail } = await client
                    .from('professionals')
                    .select('id')
                    .ilike('email', payload.email.trim())
                    .limit(1);
                if (byEmail && byEmail.length > 0) existingId = byEmail[0].id;
            }
            if (!existingId && payload.fullname) {
                const { data: byName } = await client
                    .from('professionals')
                    .select('id')
                    .ilike('fullname', payload.fullname.trim())
                    .limit(1);
                if (byName && byName.length > 0) existingId = byName[0].id;
            }

            if (existingId) {
                const { data, error } = await withTimeout(
                    client.from('professionals').update(payload).eq('id', existingId).select()
                );
                if (error) throw error;
                return { success: true, data };
            } else {
                const { data, error } = await withTimeout(
                    client.from('professionals').insert([payload]).select()
                );
                if (error) throw error;
                return { success: true, data };
            }
        } catch (err) {
            console.warn('[Thalam Supabase] Error inserting professional to remote Supabase:', err.message);
            return { success: false, localOnly: true, error: err };
        }
    },

    /**
     * Dynamic Renderer for Find Professionals.html cards
     */
    async loadIntoCards(containerId = 'featuredCards', page = 0) {
        const pageResult = await this.fetchPage(page);
        const professionals = pageResult.data;
        const container = document.getElementById(containerId);
        const countEl = document.getElementById('recordCount');

        if (!professionals || professionals.length === 0) {
            if (container && page === 0) {
                container.innerHTML = `<div id="emptyStateCard" style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; color: #64748b;"><div style="font-size: 16px; font-weight: 600; color: #334155; margin-bottom: 6px;">No registered professionals yet</div><div style="font-size: 13.5px;">Register your profile via <a href="Register.html" style="color: #dc2626; font-weight: 600; text-decoration: underline;">Professional Registration</a> or Admin Panel to populate this showcase.</div></div>`;
            }
            const loadMoreEmpty = document.getElementById('loadMoreProfessionals');
            if (loadMoreEmpty) loadMoreEmpty.style.display = 'none';
            if (countEl && page === 0) countEl.innerText = '0';
            return true;
        }

        if (!container) return false;

        const cardMarkup = professionals.map(p => {
            const years = parseInt(p.experience_years || '0', 10);
            let expClass = 'exp-1-3';
            if (years >= 10) expClass = 'exp-10-plus';
            else if (years >= 5) expClass = 'exp-5-10';
            else if (years >= 3) expClass = 'exp-3-5';

            const locClass = (p.location || '').toLowerCase().includes('coimbatore') ? 'loc-coimbatore' : 'loc-chennai';
            const specClass = (p.category || '').toLowerCase().includes('tech') ? 'spec-software-dev' : 'spec-legal-advisory';

            const keywords = `${p.fullname} ${p.professional_title} ${p.location} ${p.skills || ''} ${p.specialization || ''} ${p.current_organization || ''}`.toLowerCase();

            const isValidLink = (val) => Boolean(val && typeof val === 'string' && val.trim() !== '' && val.trim() !== '#' && val.trim().toLowerCase() !== 'n/a' && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'undefined');

            const hasWebsite = isValidLink(p.website);
            const hasLinkedin = isValidLink(p.linkedin);
            const hasInstagram = isValidLink(p.instagram || p.social_media);
            const hasYoutube = isValidLink(p.youtube);
            const hasTwitter = isValidLink(p.twitter);
            const hasAnySocial = hasWebsite || hasLinkedin || hasInstagram || hasYoutube || hasTwitter;

            return `
            <div class="card profile-card item-card" 
                data-name="${escapeHtml(p.fullname)}" 
                data-years="${years}" 
                data-exp="${expClass}"
                data-loc="${locClass}" 
                data-spec="${specClass}"
                data-keywords="${escapeHtml(keywords)}"
                onclick="toggleCardDetails(this, event)">
                <div>
                    <div class="profile-main">
                        <img src="${escapeHtml(p.profile_photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop')}"
                            alt="${escapeHtml(p.fullname)}" class="profile-img">
                        <div class="profile-info">
                            <h3>${escapeHtml(p.fullname)}</h3>
                            <div class="profession">${escapeHtml(p.professional_title)}</div>
                        </div>
                    </div>

                    <div class="expanded-details">
                        <ul>
                            <li><span>Domain of Expertise:</span> <strong>${escapeHtml(p.category || 'N/A')}</strong></li>
                            <li><span>Specialization:</span> <strong>${escapeHtml(p.specialization || 'N/A')}</strong></li>
                            <li><span>Current Organization:</span> <strong>${escapeHtml(p.current_organization || 'N/A')}</strong></li>
                            <li><span>Designation:</span> <strong>${escapeHtml(p.designation || 'N/A')}</strong></li>
                            <li><span>Industry Experience:</span> <strong>${escapeHtml(p.industry_experience || 'N/A')}</strong></li>
                            <li><span>Years of Experience:</span> <strong>${years}+ Years</strong></li>
                            <li><span>Skills:</span> <strong>${escapeHtml(p.skills || 'N/A')}</strong></li>
                            <li><span>Qualification:</span> <strong>${escapeHtml(p.qualification || 'N/A')}</strong></li>
                            <li><span>Languages Known:</span> <strong>${escapeHtml(p.languages || 'N/A')}</strong></li>
                            <li><span>Availability:</span> <strong>${escapeHtml(p.availability || 'Available')}</strong></li>
                            <li><span>Location:</span> <strong>${escapeHtml(p.location || 'N/A')}</strong></li>
                            ${isValidLink(p.phone) ? `<li><span>Phone Number:</span> <strong>${escapeHtml(p.phone)}</strong></li>` : ''}
                            ${hasWebsite ? `<li><span>Website:</span> <strong><a href="${escapeHtml(p.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--th-primary,#dc2626);">${escapeHtml(p.website)}</a></strong></li>` : ''}
                        </ul>
                    </div>
                </div>

                <div class="card-actions">
                    ${hasAnySocial ? `
                    <div class="profile-socials">
                        ${hasWebsite ? `
                        <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener noreferrer" title="Website" class="soc-website" onclick="event.stopPropagation();">
                            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                        </a>` : ''}
                        ${hasLinkedin ? `
                        <a href="${escapeHtml(p.linkedin)}" target="_blank" rel="noopener noreferrer" title="LinkedIn" class="soc-linkedin" onclick="event.stopPropagation();">
                            <svg viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.75a1.48 1.48 0 1 0 0 2.96 1.48 1.48 0 0 0 0-2.96z"/></svg>
                        </a>` : ''}
                        ${hasInstagram ? `
                        <a href="${escapeHtml(p.instagram || p.social_media)}" target="_blank" rel="noopener noreferrer" title="Instagram" class="soc-instagram" onclick="event.stopPropagation();">
                            <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        </a>` : ''}
                        ${hasYoutube ? `
                        <a href="${escapeHtml(p.youtube)}" target="_blank" rel="noopener noreferrer" title="YouTube" class="soc-youtube" onclick="event.stopPropagation();">
                            <svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        </a>` : ''}
                        ${hasTwitter ? `
                        <a href="${escapeHtml(p.twitter)}" target="_blank" rel="noopener noreferrer" title="Twitter / X" class="soc-website" onclick="event.stopPropagation();">
                            <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>` : ''}
                    </div>` : '<div></div>'}

                    <button class="toggle-details-btn">
                        Details <span class="arrow-icon">▼</span>
                    </button>
                </div>
            </div>`;
        }).join('');

        if (page === 0) {
            container.innerHTML = cardMarkup;
        } else {
            container.insertAdjacentHTML('beforeend', cardMarkup);
        }

        if (countEl) countEl.innerText = container.querySelectorAll('.item-card').length;

        let loadMore = document.getElementById('loadMoreProfessionals');
        if (!loadMore) {
            loadMore = document.createElement('button');
            loadMore.id = 'loadMoreProfessionals';
            loadMore.type = 'button';
            loadMore.textContent = 'Load more profiles';
            loadMore.style.cssText = 'display:block;margin:24px auto;padding:10px 18px;border:1px solid #dc2626;background:#fff;color:#dc2626;font:600 14px Poppins,sans-serif;cursor:pointer;';
            container.parentNode.appendChild(loadMore);
        }
        loadMore.style.display = pageResult.hasMore ? 'block' : 'none';
        loadMore.disabled = false;
        loadMore.onclick = async () => {
            loadMore.disabled = true;
            loadMore.textContent = 'Loading...';
            await this.loadIntoCards(containerId, page + 1);
            loadMore.textContent = 'Load more profiles';
        };

        if (typeof filterProfessionals === 'function') {
            filterProfessionals();
        }

        return true;
    }
};

// ==============================================================================
// 4. TRUSTED PARTNERS API & DYNAMIC RENDERER
// ==============================================================================
const ThalamPartners = {
    /**
     * Fetch approved partners
     */
    async fetchAll() {
        try {
            const saved = localStorage.getItem('thalam_admin_partners');
            if (saved) {
                const list = JSON.parse(saved);
                if (Array.isArray(list) && list.length > 0) {
                    return list.filter(p => p.is_approved);
                }
            }
        } catch (e) {
            console.warn('Local storage read error for partners:', e);
        }

        const client = getSupabase();
        if (!client) return [];

        try {
            const query = client
                .from('partners')
                .select('*')
                .eq('is_approved', true)
                .order('created_at', { ascending: false });

            const { data, error } = await withTimeout(query);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.warn('Supabase fetch failed for partners:', e.message);
            return [];
        }
    },

    /**
     * Submit new partner application
     */
    async register(partnerData) {
        const payload = {
            partner_name: partnerData.partner_name || partnerData.organization_name || partnerData.organization || 'Unnamed Partner',
            partner_type: partnerData.partner_type || partnerData.category || 'Strategic Partner',
            category: partnerData.category || partnerData.partner_type || 'Strategic Partner',
            contact_person: partnerData.contact_person || '',
            designation: partnerData.designation || '',
            email: partnerData.email || '',
            phone: partnerData.phone || '',
            location: partnerData.location || '',
            website_url: partnerData.website_url || '',
            logo_url: partnerData.logo_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=120&auto=format&fit=crop',
            description: partnerData.description || '',
            is_approved: false,
            created_at: new Date().toISOString()
        };

        try {
            const saved = localStorage.getItem('thalam_admin_partners');
            let list = saved ? JSON.parse(saved) : [];
            list.unshift({ id: 'partner-' + Date.now(), ...payload });
            localStorage.setItem('thalam_admin_partners', JSON.stringify(list));
        } catch (e) {
            console.warn('Local storage cache update failed for partner:', e);
        }

        const client = getSupabase();
        if (!client) return { success: true, localOnly: true, data: payload };

        try {
            const { data, error } = await withTimeout(
                client.from('partners').insert([payload])
            );
            if (error) throw error;
            return { success: true, data };
        } catch (e) {
            console.warn('Supabase insert failed for partner:', e.message);
            return { success: false, localOnly: true, error: e, data: payload };
        }
    },

    /**
     * Dynamic Renderer for trusted_partners.html
     */
    async loadIntoGrid(containerId = 'partnersGridContainer', emptyBoxId = 'noPartnersBox') {
        const partners = await this.fetchAll();
        const container = document.getElementById(containerId);
        const emptyBox = document.getElementById(emptyBoxId);

        if (!partners || partners.length === 0) {
            if (emptyBox) emptyBox.style.display = 'block';
            if (container) container.style.display = 'none';
            return false;
        }

        if (emptyBox) emptyBox.style.display = 'none';
        if (!container) return false;

        const isValidLink = (val) => Boolean(val && typeof val === 'string' && val.trim() !== '' && val.trim() !== '#' && val.trim().toLowerCase() !== 'n/a' && val.trim().toLowerCase() !== 'null');

        container.style.display = 'grid';
        container.innerHTML = partners.map(p => {
            const orgName = p.partner_name || p.organization_name || 'Strategic Partner';
            const hasWebsite = isValidLink(p.website_url);
            return `
            <div class="partner-card">
                <div class="partner-card-header">
                    <img src="${escapeHtml(p.logo_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=120&auto=format&fit=crop')}" alt="${escapeHtml(orgName)} Logo" class="partner-logo">
                    <div class="partner-meta">
                        <h3 class="partner-org-name">${escapeHtml(orgName)}</h3>
                        <div class="partner-category-text">${escapeHtml(p.partner_type || p.category || 'Strategic Partner')}</div>
                        ${p.location ? `<div class="partner-location-text">${escapeHtml(p.location)}</div>` : ''}
                    </div>
                </div>
                <p class="partner-description">${escapeHtml(p.description || p.collaboration_scope || 'Strategic alliance committed to supporting startup innovation, business scalability, and ecosystem growth across the Thaalam network.')}</p>
                <div class="partner-card-footer">
                    ${hasWebsite ? `
                        <a href="${escapeHtml(p.website_url)}" target="_blank" rel="noopener noreferrer" class="btn-partner-visit">
                            <span>Visit Partner</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                    ` : ''}
                    ${p.contact_person ? `<span class="partner-lead-person">Lead: ${escapeHtml(p.contact_person)}</span>` : ''}
                </div>
            </div>`;
        }).join('');

        return true;
    }
};

async function uploadFile(file, folder = 'uploads') {
    if (!file) return { success: false, error: new Error('No file selected') };

    const client = getSupabase();
    if (!client) return { success: false, error: new Error('Supabase is not configured') };

    const safeName = String(file.name || 'upload.bin')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-');
    const uniquePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    try {
        const { error } = await client.storage
            .from('thaalam-uploads')
            .upload(uniquePath, file, {
                cacheControl: '3600',
                contentType: file.type || 'application/octet-stream',
                upsert: false
            });

        if (error) throw error;

        const { data } = client.storage.from('thaalam-uploads').getPublicUrl(uniquePath);
        return { success: true, url: data.publicUrl, path: uniquePath };
    } catch (error) {
        console.warn('[Thalam Supabase] File upload failed:', error);
        return { success: false, error };
    }
}

// ==============================================================================
// 5. UTILITY: HTML ESCAPING TO PREVENT XSS
// ==============================================================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==============================================================================
// 6. UTILITY: CLEAN TRACKING PARAMS FROM URLS
// Strips utm_*, igsh, fbclid, gclid, ref, stkn etc. before storing/displaying
// ==============================================================================
function cleanUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) return trimmed;
    try {
        const u = new URL(trimmed);

        // Never strip params from Google Drive / Docs / Sheets — they need query params
        const googleDomains = ['drive.google.com', 'docs.google.com', 'sheets.google.com',
                               'forms.google.com', 'slides.google.com', 'maps.google.com',
                               'script.google.com', 'googleapis.com'];
        if (googleDomains.some(d => u.hostname.includes(d))) {
            return trimmed;
        }

        const TRACKING_PARAMS = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'igsh', 'igshid', 'fbclid', 'gclid', 'gad_source', 'ref',
            'stkn', 'stkncDN1NncxcWthazdr', '_ga', 'mc_cid', 'mc_eid'
        ];
        TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
        const clean = u.toString();
        return clean.endsWith('?') ? clean.slice(0, -1) : clean;
    } catch (e) {
        return trimmed;
    }
}

// Attach globally
window.ThalamSupabase = {
    getSupabase,
    uploadFile,
    businesses: ThalamBusinesses,
    professionals: ThalamProfessionals,
    partners: ThalamPartners,
    escapeHtml,
    cleanUrl
};
