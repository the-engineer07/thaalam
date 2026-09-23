/**
 * THAALAM ADMIN PANEL - CORE LOGIC & CONTROLLER
 * Comprehensive CRUD, Supabase sync, offline fallback, search, and export engine.
 * Synchronized with Business Directory and Find Professionals catalogs.
 */

(function () {
    'use strict';

    // 1. CONSTANTS & SESSION KEY
    const SESSION_KEY = 'thaalam_admin_auth';
    const DATA_VERSION = 'v4_synced_directory';
    function isValidLink(url) {
        if (!url) return false;
        const s = String(url).trim();
        return s !== '' && s !== '#' && s !== 'N/A' && s !== 'null' && s !== 'undefined' && (s.startsWith('http://') || s.startsWith('https://'));
    }

    function formatDateDisplay(val) {
        if (!val) return '';
        try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return String(val);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return String(val);
        }
    }

    // 2. IN-MEMORY STATE
    const state = {
        authenticated: false,
        currentUser: null,
        activeTab: 'dashboard',
        businesses: [],
        professionals: [],
        partners: [],
        inquiries: []
    };

    // Baseline Seed Businesses (Synchronized with Business_Directory.html)
    const initialBusinesses = [];

    // Baseline Seed Professionals (Synchronized with Find Professionals.html)
    const initialProfessionals = [];

    // Baseline Seed Partners (Synchronized with trusted_partners.html)
    const initialPartners = [];

    // ==============================================================================
    // ==============================================================================
    // 3. STORAGE & SUPABASE SYNC ENGINE WITH DEDUPLICATION
    // ==============================================================================

    /**
     * Deduplicate business listings by normalized company name, email, or phone
     */
    function isLocalId(id) {
        if (!id) return true;
        const s = String(id);
        return s.startsWith('temp-') || s.startsWith('b-') || s.startsWith('p-');
    }

    function deduplicateBizList(list) {
        if (!Array.isArray(list)) return [];
        const merged = new Map();
        for (const b of list) {
            if (!b) continue;
            const uniqueKey = ((b.email || '').toLowerCase().trim() + '|' + (b.company_name || '').toLowerCase().trim()) || b.id || String(Math.random());

            if (merged.has(uniqueKey)) {
                const existing = merged.get(uniqueKey);
                // Prefer real Supabase UUID over any local (b- / temp-) id
                if (b.id && !isLocalId(b.id) && isLocalId(existing.id)) {
                    merged.set(uniqueKey, b);
                }
                // else keep existing (which is already the better record)
            } else {
                merged.set(uniqueKey, b);
            }
        }
        return Array.from(merged.values());
    }



    // ==============================================================================
    // ==============================================================================
    // 3. STORAGE & SUPABASE SYNC ENGINE WITH DEDUPLICATION
    // ==============================================================================

    /**
     * Deduplicate professional profiles by normalized full name, email, or phone
     */
    function deduplicateProList(list) {
        if (!Array.isArray(list)) return [];
        const merged = new Map();
        for (const p of list) {
            if (!p) continue;
            const uniqueKey = ((p.email || '').toLowerCase().trim() + '|' + (p.fullname || '').toLowerCase().trim()) || p.id || String(Math.random());

            if (merged.has(uniqueKey)) {
                const existing = merged.get(uniqueKey);
                // Prefer real Supabase UUID over any local (p- / temp-) id
                if (p.id && !isLocalId(p.id) && isLocalId(existing.id)) {
                    merged.set(uniqueKey, p);
                }
            } else {
                merged.set(uniqueKey, p);
            }
        }
        return Array.from(merged.values());
    }

    /**
     * Deduplicate partners by normalized organization name
     */
    function deduplicatePartnerList(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        return list.filter(pt => {
            if (!pt) return false;
            const key = (pt.partner_name || '').toLowerCase().trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Deduplicate inquiries by client name + email combo
     */
    function deduplicateInquiries(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        return list.filter(inq => {
            if (!inq) return false;
            const key = inq.source === 'Google Sheets' || inq.source?.startsWith('Google Sheets')
                ? `sheet:${inq.source}:${inq._sheetRow || inq.id || ''}`
                : `record:${inq.id || `${inq.client_name || ''}|${inq.created_at || ''}|${inq.message || ''}`}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function removeDuplicates(silent = false) {
        const countBizBefore = state.businesses.length;
        const countProBefore = state.professionals.length;
        const countPartBefore = state.partners.length;

        state.businesses = deduplicateBizList(state.businesses);
        state.professionals = deduplicateProList(state.professionals);
        state.partners = deduplicatePartnerList(state.partners);
        state.inquiries = deduplicateInquiries(state.inquiries);

        const diffBiz = countBizBefore - state.businesses.length;
        const diffPro = countProBefore - state.professionals.length;
        const diffPart = countPartBefore - state.partners.length;
        const totalPurged = diffBiz + diffPro + diffPart;

        persistData();
        refreshDashboard();

        if (state.activeTab === 'biz-directory') renderBizDirectoryTable();
        else if (state.activeTab === 'biz-registration') renderBizRegistrationTable();
        else if (state.activeTab === 'pro-directory') renderProDirectoryTable();
        else if (state.activeTab === 'partners') renderPartnersTable();
        return { totalPurged, diffBiz, diffPro, diffPart };
    }

    const SEED_PARTNERS = [
        {
            id: 'partner-vyiom-1',
            partner_name: 'Vyiom Digital Solutions',
            organization_name: 'Vyiom Digital Solutions',
            partner_type: 'Technology Partners',
            category: 'Technology Partners',
            location: 'Tamil Nadu',
            contact_person: 'Vyiom Team',
            designation: 'Technology & Cloud Partner',
            email: 'contact@vyiom.in',
            phone: '+91 94440 00000',
            website_url: 'https://vyiom.in/',
            instagram_url: 'https://www.instagram.com/vyiom.in/',
            logo_url: 'https://vyiom.in/assets/logo/logo1.png',
            description: 'VYIOM is a technology partner of Thaalam, providing innovative digital solutions to help businesses grow and transform.',
            is_approved: true,
            source: 'Thaalam Core Ecosystem',
            created_at: new Date().toISOString()
        }
    ];

    function loadSavedData() {
        try {
            state.businesses = JSON.parse(localStorage.getItem('thalam_admin_businesses') || '[]');
        } catch (e) { state.businesses = []; }

        try {
            state.professionals = JSON.parse(localStorage.getItem('thalam_admin_professionals') || '[]');
        } catch (e) { state.professionals = []; }

        try {
            const storedPartners = JSON.parse(localStorage.getItem('thalam_admin_partners') || '[]');
            state.partners = Array.isArray(storedPartners) && storedPartners.length > 0 ? storedPartners : [...SEED_PARTNERS];
        } catch (e) {
            state.partners = [...SEED_PARTNERS];
        }

        try {
            state.inquiries = JSON.parse(localStorage.getItem('thalam_admin_inquiries') || '[]');
        } catch (e) { state.inquiries = []; }

        // Clean out any stale fallback placeholder records from earlier buggy mapping
        state.professionals = state.professionals.filter(p => p && p.fullname && p.fullname !== 'Professional Candidate');
    }

    function persistData() {
        state.businesses = deduplicateBizList(state.businesses);
        state.professionals = deduplicateProList(state.professionals);
        state.partners = deduplicatePartnerList(state.partners);
        state.inquiries = deduplicateInquiries(state.inquiries);

        try {
            localStorage.setItem('thalam_admin_businesses', JSON.stringify(state.businesses));
            localStorage.setItem('thalam_admin_professionals', JSON.stringify(state.professionals));
            localStorage.setItem('thalam_admin_partners', JSON.stringify(state.partners));
            localStorage.setItem('thalam_admin_inquiries', JSON.stringify(state.inquiries));
        } catch (e) {
            console.warn('LocalStorage save error:', e);
        }
    }

    function resetAdminState() {
        try {
            localStorage.removeItem('thalam_admin_businesses');
            localStorage.removeItem('thalam_admin_professionals');
            localStorage.removeItem('thalam_admin_partners');
            localStorage.removeItem('thalam_admin_inquiries');
        } catch (e) {}
        loadSavedData();
        refreshDashboard();
        showToast('Session data reset. Re-syncing live data...', 'info');
    }

    // Try fetching from live Supabase if client is ready
    async function syncWithSupabase() {
        if (!window.ThalamSupabase || typeof window.ThalamSupabase.getSupabase !== 'function') return;
        const client = window.ThalamSupabase.getSupabase();
        if (!client) return;

        try {
            // ── Businesses ────────────────────────────────────────────────────────
            const { data: bData, error: bErr } = await client.from('businesses').select('*');
            if (!bErr && Array.isArray(bData)) {
                // Use Supabase as source of truth. Keep local-only records (b- IDs) only
                // if they have no matching entry in Supabase (by company_name + email).
                const supabaseKeys = new Set(
                    bData.map(b => ((b.email || '').toLowerCase().trim() + '|' + (b.company_name || '').toLowerCase().trim()))
                );
                const localOnlyRecords = state.businesses.filter(b =>
                    isLocalId(b.id) &&
                    !supabaseKeys.has((b.email || '').toLowerCase().trim() + '|' + (b.company_name || '').toLowerCase().trim())
                );
                state.businesses = [...bData, ...localOnlyRecords];
            }

            // ── Professionals ─────────────────────────────────────────────────────
            const { data: pData, error: pErr } = await client.from('professionals').select('*');
            if (!pErr && Array.isArray(pData)) {
                const supabaseProKeys = new Set(
                    pData.map(p => ((p.email || '').toLowerCase().trim() + '|' + (p.fullname || '').toLowerCase().trim()))
                );
                const localOnlyPros = state.professionals.filter(p =>
                    isLocalId(p.id) &&
                    !supabaseProKeys.has((p.email || '').toLowerCase().trim() + '|' + (p.fullname || '').toLowerCase().trim())
                );
                state.professionals = [...pData, ...localOnlyPros];
            }

            // ── Partners ──────────────────────────────────────────────────────────
            const { data: partData, error: partErr } = await client.from('partners').select('*');
            if (!partErr && Array.isArray(partData) && partData.length > 0) {
                state.partners = deduplicatePartnerList([...partData, ...state.partners]);
            }

            persistData();
            refreshDashboard();
        } catch (e) {
            console.info('[Thaalam Admin] Operating in offline/local-first mode:', e.message);
        }
    }


    // ==============================================================================
    // 4. AUTHENTICATION & SECURITY FLOW
    // ==============================================================================
    function checkExistingAuth() {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (!stored) {
            state.authenticated = false;
            state.currentUser = null;
            showLoginModal();
            return;
        }

        try {
            const user = JSON.parse(stored);
            if (user && user.email) {
                state.authenticated = true;
                state.currentUser = user;
                showAdminApp();
                return;
            }
        } catch (err) {
            sessionStorage.removeItem(SESSION_KEY);
        }

        state.authenticated = false;
        state.currentUser = null;
        showLoginModal();
    }

    function showLoginModal() {
        const authWrapper = document.getElementById('authWrapper') || document.getElementById('loginModal');
        const adminLayout = document.getElementById('adminLayout') || document.querySelector?.('.admin-layout') || document.getElementById('adminApp');
        if (authWrapper) authWrapper.style.display = 'flex';
        if (adminLayout) adminLayout.style.display = 'none';

        const passInput = document.getElementById('adminPassword') || document.getElementById('loginPassword');
        if (passInput) passInput.value = '';

        const errorEl = document.getElementById('adminAuthError') || document.getElementById('loginError');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }

    function showAdminApp() {
        const authWrapper = document.getElementById('authWrapper') || document.getElementById('loginModal');
        const adminLayout = document.getElementById('adminLayout') || document.querySelector?.('.admin-layout') || document.getElementById('adminApp');
        if (authWrapper) authWrapper.style.display = 'none';
        if (adminLayout) adminLayout.style.display = 'flex';

        // Update user badge in UI
        if (state.currentUser) {
            const userNameEl = document.getElementById('sidebarUserName');
            const userAvatarEl = document.getElementById('sidebarAvatar');
            if (userNameEl) userNameEl.textContent = state.currentUser.name || 'Admin Officer';
            if (userAvatarEl) userAvatarEl.textContent = (state.currentUser.name || 'A')[0].toUpperCase();
        }

        refreshDashboard();


    }

    async function handleLoginSubmit(e) {
        if (e) e.preventDefault();
        const emailInput = document.getElementById('adminEmail') || document.getElementById('loginEmail');
        const passInput = document.getElementById('adminPassword') || document.getElementById('loginPassword');
        const errorEl = document.getElementById('adminAuthError') || document.getElementById('loginError');
        const rememberMe = document.getElementById('rememberMe');

        const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        const pass = passInput ? passInput.value : '';

        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }

        if (!email || !pass) {
            if (errorEl) {
                errorEl.textContent = 'Please enter both email and password.';
                errorEl.style.display = 'block';
            }
            showToast('Please enter both email and password.', 'error');
            return;
        }

        const shouldRemember = rememberMe ? rememberMe.checked : false;

        // Authenticate through Supabase Auth so approval actions have an RLS identity.
        if (window.ThalamSupabase && window.ThalamSupabase.getSupabase()) {
            try {
                const { data, error } = await window.ThalamSupabase.getSupabase().auth.signInWithPassword({
                    email,
                    password: pass
                });

                if (!error && data.user) {
                    loginSuccess({
                        id: data.user.id,
                        email: data.user.email,
                        name: data.user.user_metadata?.full_name || email.split('@')[0],
                        role: 'Authorized Operations Admin'
                    }, shouldRemember);
                    return;
                }
            } catch (err) {
                console.warn('Supabase Auth attempt:', err);
            }
        }

        // Failed
        const msg = 'Invalid Supabase administrator credentials.';
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
        showToast(msg, 'error');
    }

    function quickDemoLogin() {
        showToast('Demo login is disabled. Use a Supabase administrator account.', 'error');
    }

    function loginSuccess(user, remember = false) {
        state.authenticated = true;
        state.currentUser = user;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
        showToast(`Welcome back, ${user.name}!`, 'success');
        showAdminApp();
    }

    async function handleSignout() {
        if (confirm('Are you sure you want to log out of the admin console?')) {
            // 1. Completely remove all stored credentials and session tokens
            sessionStorage.removeItem(SESSION_KEY);

            // 2. Clear state
            state.authenticated = false;
            state.currentUser = null;

            // 3. Clear remote Supabase Auth session if active
            if (window.ThalamSupabase && window.ThalamSupabase.getSupabase()) {
                try {
                    await window.ThalamSupabase.getSupabase().auth.signOut();
                } catch (e) {
                    console.warn('Supabase signout warning:', e);
                }
            }

            // 4. Reset password input
            const passInput = document.getElementById('adminPassword') || document.getElementById('loginPassword');
            if (passInput) passInput.value = '';

            // 5. Completely lock out and transition to login screen
            showLoginModal();
            showToast('You have been logged out of the admin console.', 'info');
        }
    }

    // ==============================================================================
    // 5. NAVIGATION & TAB MANAGEMENT
    // ==============================================================================
    function switchTab(tabId) {
        state.activeTab = tabId;

        // Auto-close sidebar on mobile
        const sidebar = document.getElementById('adminSidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (sidebar && window.innerWidth <= 1024) {
            sidebar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('active');
        }

        // Update sidebar nav highlights
        document.querySelectorAll('.nav-item').forEach(item => {
            const matches = item.getAttribute('data-tab') === tabId;
            item.classList.toggle('active', matches);
        });

        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            const matches = pane.id === `tab-${tabId}`;
            pane.classList.toggle('active', matches);
            pane.style.display = matches ? 'block' : 'none';
        });

        // Update Header Title
        const headerTitle = document.getElementById('headerTitle');
        const titles = {
            dashboard: 'Dashboard & Overview',
            'biz-directory': 'Business Directory (Live Listings)',
            'biz-registration': 'Business Registration Queue',
            'pro-directory': 'Professional Directory (Verified Showcase)',
            'pro-registration': 'Professional Registration Queue',
            partners: 'Trusted Partners & Ecosystem Alliances',
            inquiries: 'Service & Launch Inquiries',
            settings: 'System & Supabase Settings'
        };
        if (headerTitle) headerTitle.textContent = titles[tabId] || 'Admin Panel';

        // Trigger specific render
        if (tabId === 'dashboard') renderDashboardKPIs();
        else if (tabId === 'biz-directory') renderBizDirectoryTable();
        else if (tabId === 'biz-registration') renderBizRegistrationTable();
        else if (tabId === 'pro-directory') renderProDirectoryTable();
        else if (tabId === 'pro-registration') renderProRegistrationTable();
        else if (tabId === 'partners') renderPartnersTable();
        else if (tabId === 'inquiries') renderInquiriesTable();
    }

    // ==============================================================================
    // 6. DASHBOARD & KPIS
    // ==============================================================================
    function renderDashboardKPIs() {
        const approvedBiz = state.businesses.filter(b => b.is_approved).length;
        const pendingBiz = state.businesses.filter(b => !b.is_approved).length;

        const approvedPro = state.professionals.filter(p => p.is_approved).length;
        const pendingPro = state.professionals.filter(p => !p.is_approved).length;

        const totalInq = state.inquiries.length;

        // Metric Stat Cards
        setElText('statTotalBiz', approvedBiz);
        setElText('statPendingBiz', pendingBiz);
        setElText('statTotalPro', approvedPro);
        setElText('statPendingPro', pendingPro);
        setElText('statTotalInq', totalInq);

        const approvedPartners = state.partners.filter(p => p.is_approved).length;
        setElText('badgePartnersCount', approvedPartners);

        // Sidebar count badges
        setElText('badgeBizDirCount', approvedBiz);
        setElText('badgeBizRegCount', pendingBiz);
        setElText('badgeProDirCount', approvedPro);
        setElText('badgeProRegCount', pendingPro);

        // Render Recent Activity lists on Dashboard
        renderRecentBusinesses();
        renderRecentProfessionals();
    }

    function renderRecentBusinesses() {
        const container = document.getElementById('recentBizTableBody');
        if (!container) return;

        const recent = state.businesses.slice(0, 5);
        if (recent.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="empty-state">No businesses registered yet.</td></tr>`;
            return;
        }

        container.innerHTML = recent.map(b => `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(b.logo_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100&auto=format&fit=crop')}" class="entity-thumb" alt="Logo">
                        <div>
                            <div class="entity-name">${escapeHtml(b.company_name)}</div>
                            <div class="entity-sub">${escapeHtml(b.company_type || 'Company')}</div>
                        </div>
                    </div>
                </td>
                <td><div class="cell-category-title">${escapeHtml(b.sector || b.category || 'General')}</div></td>
                <td>${escapeHtml(b.founder || 'N/A')}</td>
                <td>
                    <span class="badge ${b.is_approved ? 'badge-approved' : 'badge-pending'}">
                        <span class="badge-dot"></span> ${b.is_approved ? 'Approved' : 'Pending'}
                    </span>
                </td>
                <td>
                    <button class="action-btn" onclick="window.ThalamAdmin.switchTab('${b.is_approved ? 'biz-directory' : 'biz-registration'}')">Manage</button>
                </td>
            </tr>
        `).join('');
    }

    function renderRecentProfessionals() {
        const container = document.getElementById('recentProTableBody');
        if (!container) return;

        const recent = state.professionals.slice(0, 5);
        if (recent.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="empty-state">No professionals registered yet.</td></tr>`;
            return;
        }

        container.innerHTML = recent.map(p => `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(p.profile_photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop')}" class="entity-thumb" style="border-radius: 50%;" alt="Photo">
                        <div>
                            <div class="entity-name">${escapeHtml(p.fullname)}</div>
                            <div class="entity-sub">${escapeHtml(p.professional_title || 'Consultant')}</div>
                        </div>
                    </div>
                </td>
                <td><div class="cell-category-title">${escapeHtml(p.category || 'Expert')}</div></td>
                <td>${escapeHtml(p.location || 'Tamil Nadu')} &bull; ${escapeHtml(p.experience_years ? p.experience_years + ' yrs' : 'Exp')}</td>
                <td>
                    <span class="badge ${p.is_approved ? 'badge-approved' : 'badge-pending'}">
                        <span class="badge-dot"></span> ${p.is_approved ? 'Verified' : 'Pending'}
                    </span>
                </td>
                <td>
                    <button class="action-btn" onclick="window.ThalamAdmin.switchTab('${p.is_approved ? 'pro-directory' : 'pro-registration'}')">Manage</button>
                </td>
            </tr>
        `).join('');
    }

    // ==============================================================================
    // 7. BUSINESS DIRECTORY MANAGEMENT (CRUD)
    // ==============================================================================
    function renderBizDirectoryTable() {
        const tbody = document.getElementById('bizDirectoryTableBody');
        if (!tbody) return;

        const filterSector = document.getElementById('bizSectorFilter')?.value || 'all';
        const searchKeyword = (document.getElementById('globalSearchInput')?.value || '').toLowerCase();

        let list = state.businesses.filter(b => b.is_approved);

        if (filterSector !== 'all') {
            list = list.filter(b => (b.category === filterSector || b.sector === filterSector));
        }
        if (searchKeyword) {
            list = list.filter(b =>
                (b.company_name && b.company_name.toLowerCase().includes(searchKeyword)) ||
                (b.category && b.category.toLowerCase().includes(searchKeyword)) ||
                (b.sector && b.sector.toLowerCase().includes(searchKeyword)) ||
                (b.founder && b.founder.toLowerCase().includes(searchKeyword)) ||
                (b.service_area && b.service_area.toLowerCase().includes(searchKeyword)) ||
                (b.address && b.address.toLowerCase().includes(searchKeyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-state-icon-wrap"><svg class="admin-icon-xl" viewBox="0 0 24 24"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg></div>No published companies found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(b => `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(b.logo_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100&auto=format&fit=crop')}" class="entity-thumb" alt="Logo">
                        <div>
                            <div class="entity-name">${escapeHtml(b.company_name)}</div>
                            <div class="entity-sub">${escapeHtml(b.service_area || b.address || 'Tamil Nadu')}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="cell-category-title">${escapeHtml(b.category || 'General')}</div>
                    <div class="cell-category-sub">${escapeHtml(b.sector || '')}</div>
                </td>
                <td>${escapeHtml(b.founder || 'N/A')}</td>
                <td><strong>${escapeHtml(b.established_year || 'N/A')}</strong></td>
                <td>
                    <div style="font-size: 12px; line-height: 1.4;">
                        <div>${escapeHtml(b.email || '')}</div>
                        <div style="color: var(--th-slate-500);">${escapeHtml(b.phone || '')}</div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-approved">
                        <span class="badge-dot"></span> Published
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="action-btn" title="Revoke to Pending" onclick="window.ThalamAdmin.toggleBizApproval('${b.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            <span>Revoke</span>
                        </button>
                        <button class="action-btn" title="Edit Business" onclick="window.ThalamAdmin.openEditBizModal('${b.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            <span>Edit</span>
                        </button>
                        <button class="action-btn delete" title="Delete Listing" onclick="window.ThalamAdmin.deleteBiz('${b.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderBizRegistrationTable() {
        const tbody = document.getElementById('bizRegistrationTableBody');
        if (!tbody) return;

        const searchKeyword = (document.getElementById('globalSearchInput')?.value || '').toLowerCase();
        const statusFilter = document.getElementById('bizRegStatusFilter')?.value || 'pending';
        let list = statusFilter === 'all' ? state.businesses : state.businesses.filter(b => !b.is_approved);

        if (searchKeyword) {
            list = list.filter(b =>
                (b.company_name && b.company_name.toLowerCase().includes(searchKeyword)) ||
                (b.category && b.category.toLowerCase().includes(searchKeyword)) ||
                (b.sector && b.sector.toLowerCase().includes(searchKeyword)) ||
                (b.founder && b.founder.toLowerCase().includes(searchKeyword)) ||
                (b.address && b.address.toLowerCase().includes(searchKeyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-state-icon-wrap"><svg class="admin-icon-xl" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>All registrations have been reviewed! No pending submissions.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(b => `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(b.logo_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=100&auto=format&fit=crop')}" class="entity-thumb" alt="Logo">
                        <div>
                            <div class="entity-name">${escapeHtml(b.company_name)}</div>
                            <div class="entity-sub">${escapeHtml(b.service_area || b.address || 'Chennai')}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="cell-category-title">${escapeHtml(b.category || b.industry_category || 'General')}</div>
                    <div class="cell-category-sub">${escapeHtml(b.sector || b.industry || '')}</div>
                </td>
                <td>${escapeHtml(b.founder || 'N/A')}</td>
                <td>
                    <div><strong>${escapeHtml(b.established_year || 'N/A')}</strong></div>
                    ${(b.submission_time || b.created_at) ? `<div style="font-size: 11px; color: var(--th-slate-500); margin-top: 2px;" title="Submission Time">${escapeHtml(formatDateDisplay(b.submission_time || b.created_at))}</div>` : ''}
                </td>
                <td>
                    <div style="font-size: 12px; line-height: 1.4;">
                        <div>${escapeHtml(b.email || '')}</div>
                        <div style="color: var(--th-slate-500);">${escapeHtml(b.phone || '')}</div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-pending">
                        <span class="badge-dot"></span> Pending Approval
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="action-btn approve" title="Approve & Publish to Directory" onclick="window.ThalamAdmin.toggleBizApproval('${b.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Approve</span>
                        </button>
                        <button class="action-btn" title="Inspect & Edit Details" onclick="window.ThalamAdmin.openEditBizModal('${b.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            <span>Review</span>
                        </button>
                        <button class="action-btn delete" title="Reject Application" onclick="window.ThalamAdmin.deleteBiz('${b.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderBusinessesTable() {
        renderBizDirectoryTable();
        renderBizRegistrationTable();
    }

    async function pushBizToSupabase(item) {
        if (!window.ThalamSupabase || typeof window.ThalamSupabase.getSupabase !== 'function') return false;
        const client = window.ThalamSupabase.getSupabase();
        if (!client) return false;

        if (!state.authenticated || !state.currentUser) {
            item._supabaseSyncError = 'Admin session not found. Please log in to the admin panel first.';
            return false;
        }

        const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));

        try {
            const payload = {
                company_name:     item.company_name || 'Unnamed Business',
                industry_category: item.industry_category || item.category || 'General',
                sector:           item.sector || item.industry || 'General',
                sub_category:     item.sub_category || item.industry || '',
                company_type:     item.company_type || 'Private Limited Company',
                founder:          item.founder || '',
                established_year: parseInt(item.established_year || '2024', 10) || 2024,
                gst_number:       item.gst_number || '',
                email:            item.email || '',
                phone:            item.phone || '',
                service_area:     item.service_area || '',
                address:          item.address || '',
                website_url:      item.website_url || '',
                linkedin_url:     item.linkedin_url || '',
                instagram_url:    item.instagram_url || '',
                logo_url:         item.logo_url || '',
                services_products: item.services_products || '',
                description:      item.description || '',
                is_approved:      Boolean(item.is_approved),
                created_at:       item.created_at || new Date().toISOString()
            };

            if (isUuid(item.id)) {
                payload.id = item.id;
            }

            // Lookup existing record by email or company_name if ID is missing (prevents duplicate rows)
            if (!payload.id && item.email) {
                const { data: existingList } = await client
                    .from('businesses')
                    .select('id')
                    .ilike('email', item.email.trim())
                    .limit(1);
                if (existingList && existingList[0]?.id) payload.id = existingList[0].id;
            }
            if (!payload.id && item.company_name) {
                const { data: existingList } = await client
                    .from('businesses')
                    .select('id')
                    .ilike('company_name', item.company_name.trim())
                    .limit(1);
                if (existingList && existingList[0]?.id) payload.id = existingList[0].id;
            }

            // If item already has a real UUID, try UPDATE first, then fall back to INSERT
            if (payload.id) {
                const { data: updData, error: updErr } = await client
                    .from('businesses')
                    .update(payload)
                    .eq('id', payload.id)
                    .select('id');

                if (!updErr && updData && updData.length > 0) {
                    console.log('[Supabase] Business updated:', item.company_name);
                    return true;
                }
            }

            // INSERT new row
            const { data, error } = await client
                .from('businesses')
                .insert([payload])
                .select('id');

            if (error) throw error;
            if (data && data[0]?.id) item.id = data[0].id;
            console.log('[Supabase] Business inserted:', item.company_name);
            return true;
        } catch (err) {
            item._supabaseSyncError = err.message || String(err);
            console.warn('[Supabase Sync Warning] Could not push business to Supabase:', item._supabaseSyncError);
            return false;
        }
    }



    async function toggleBizApproval(id) {
        const item = state.businesses.find(b => String(b.id) === String(id));
        if (!item) return;

        const previousApproval = Boolean(item.is_approved);
        item.is_approved = !previousApproval;
        persistData();

        let syncedToSupabase = await pushBizToSupabase(item);
        if (!syncedToSupabase) {
            // Roll back local state so it stays consistent with Supabase
            item.is_approved = previousApproval;
            persistData();
            const errMsg = item._supabaseSyncError ? item._supabaseSyncError : 'Supabase sync failed. Check connection and try again.';
            showToast(`Could not update "${item.company_name}": ${errMsg}`, 'error');
            renderBusinessesTable();
            renderDashboardKPIs();
            return;
        }

        const notifyMsg = item.is_approved
            ? `Listing Approved: "${item.company_name}" is now live on Business Directory${syncedToSupabase ? ' & Synced to Supabase' : ''}!`
            : `Listing Revoked: "${item.company_name}" removed from directory.`;

        showToast(notifyMsg, 'success');
        renderBusinessesTable();
        renderDashboardKPIs();
    }

    function openAddBizModal() {
        const modal = document.getElementById('bizModal');
        if (!modal) return;
        const title = document.getElementById('bizModalTitle');
        if (title) title.textContent = 'Add New Business Listing';
        const form = document.getElementById('bizForm');
        if (form) form.reset();
        const bizGoogleDataField = document.getElementById('bizGoogleDataField');
        if (bizGoogleDataField) bizGoogleDataField.style.display = 'none';
        const idInput = document.getElementById('bizIdInput');
        if (idInput) idInput.value = '';
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    function openEditBizModal(id) {
        const item = state.businesses.find(b => String(b.id) === String(id));
        if (!item) return;

        document.getElementById('bizModalTitle').textContent = 'Edit Business Listing';
        document.getElementById('bizIdInput').value = item.id;
        document.getElementById('bizNameInput').value = item.company_name || '';
        document.getElementById('bizCategoryInput').value = item.category || 'Information Technology & Software';
        document.getElementById('bizSectorInput').value = item.sector || '';
        document.getElementById('bizTypeInput').value = item.company_type || 'Private Limited Company';
        document.getElementById('bizFounderInput').value = item.founder || '';
        document.getElementById('bizYearInput').value = item.established_year || 2024;
        document.getElementById('bizGstInput').value = item.gst_number || '';
        const cinInput = document.getElementById('bizCinInput');
        if (cinInput) cinInput.value = item.cin || '';
        document.getElementById('bizEmailInput').value = item.email || '';
        document.getElementById('bizPhoneInput').value = item.phone || '';
        document.getElementById('bizAreaInput').value = item.service_area || '';
        document.getElementById('bizAddressInput').value = item.address || '';
        document.getElementById('bizWebsiteInput').value = item.website_url || '';
        document.getElementById('bizMapsInput').value = item.maps_url || '';
        document.getElementById('bizLinkedinInput').value = item.linkedin_url || '';
        document.getElementById('bizInstaInput').value = item.instagram_url || '';
        document.getElementById('bizLogoInput').value = item.logo_url || '';

        document.getElementById('bizApprovedSelect').value = item.is_approved ? 'true' : 'false';
        document.getElementById('bizServicesInput').value = item.services_products || '';
        document.getElementById('bizDescInput').value = item.description || '';
        const bizGoogleDataField = document.getElementById('bizGoogleDataField');
        const bizGoogleDataInput = document.getElementById('bizGoogleDataInput');
        if (bizGoogleDataField && bizGoogleDataInput && item.google_row_data) {
            bizGoogleDataField.style.display = '';
            bizGoogleDataInput.value = JSON.stringify(item.google_row_data, null, 2);
        }

        const modal = document.getElementById('bizModal');
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    async function saveBusiness(e) {
        if (e) e.preventDefault();

        const id = document.getElementById('bizIdInput').value;
        const isEdit = Boolean(id);

        const bizData = {
            company_name: document.getElementById('bizNameInput').value.trim(),
            category: document.getElementById('bizCategoryInput').value,
            sector: document.getElementById('bizSectorInput').value.trim(),
            company_type: document.getElementById('bizTypeInput').value,
            founder: document.getElementById('bizFounderInput').value.trim(),
            established_year: parseInt(document.getElementById('bizYearInput').value, 10) || 2024,
            gst_number: document.getElementById('bizGstInput').value.trim(),
            cin: document.getElementById('bizCinInput')?.value.trim() || '',
            email: document.getElementById('bizEmailInput').value.trim(),
            phone: document.getElementById('bizPhoneInput').value.trim(),
            service_area: document.getElementById('bizAreaInput').value.trim(),
            address: document.getElementById('bizAddressInput').value.trim(),
            website_url: document.getElementById('bizWebsiteInput').value.trim(),
            maps_url: document.getElementById('bizMapsInput').value.trim(),
            linkedin_url: document.getElementById('bizLinkedinInput').value.trim(),
            instagram_url: document.getElementById('bizInstaInput').value.trim(),
            logo_url: document.getElementById('bizLogoInput').value.trim() || '',
            services_products: document.getElementById('bizServicesInput').value.trim(),
            description: document.getElementById('bizDescInput').value.trim(),
            is_approved: document.getElementById('bizApprovedSelect').value === 'true'
        };

        if (isEdit) {
            const idx = state.businesses.findIndex(b => String(b.id) === String(id));
            if (idx !== -1) {
                state.businesses[idx] = { ...state.businesses[idx], ...bizData, updated_at: new Date().toISOString() };
            }

            if (bizData.is_approved) {
                await pushBizToSupabase({ id, ...bizData });
            } else if (window.ThalamSupabase && window.ThalamSupabase.getSupabase()) {
                try {
                    await window.ThalamSupabase.getSupabase().from('businesses').update({ is_approved: false }).eq('id', id);
                } catch (err) { console.warn(err); }
            }
            showToast('Business details updated successfully!', 'success');
        } else {
            const newId = 'b-' + Date.now();
            const newBiz = {
                id: newId,
                ...bizData,
                created_at: new Date().toISOString()
            };
            state.businesses.unshift(newBiz);

            if (bizData.is_approved) {
                await pushBizToSupabase(newBiz);
            }
            showToast('New business added to directory!', 'success');
        }

        persistData();
        closeModal('bizModal');
        renderBusinessesTable();
        renderDashboardKPIs();
    }

    async function deleteBiz(id) {
        const item = state.businesses.find(b => String(b.id) === String(id));
        if (!item) return;

        if (!confirm(`Are you sure you want to permanently delete "${item.company_name}" from the directory?`)) {
            return;
        }

        state.businesses = state.businesses.filter(b => String(b.id) !== String(id));
        persistData();

        const client = window.ThalamSupabase && window.ThalamSupabase.getSupabase ? window.ThalamSupabase.getSupabase() : null;

        if (!client) {
            showToast('Business removed locally (offline mode).', 'info');
        } else if (isLocalId(id)) {
            // Local fake ID — try to find the real Supabase row by company name + email
            try {
                let query = client.from('businesses').select('id').eq('company_name', item.company_name);
                if (item.email) query = query.eq('email', item.email);
                const { data: found } = await query.maybeSingle();
                if (found?.id) {
                    const { error } = await client.from('businesses').delete().eq('id', found.id);
                    if (error) {
                        showToast(`Warning: Could not delete from database. ${error.message}`, 'error');
                    } else {
                        showToast('Business listing deleted from database.', 'info');
                    }
                } else {
                    showToast('Business removed (no matching database record found).', 'info');
                }
            } catch (err) {
                console.warn('[Supabase] Delete by name/email lookup failed:', err);
                showToast('Business removed locally; database sync failed.', 'error');
            }
        } else {
            try {
                const { error } = await client.from('businesses').delete().eq('id', id);
                if (error) {
                    console.warn('[Supabase Sync Warning] Could not delete business:', error);
                    showToast(`Warning: Could not delete from database. ${error.message}`, 'error');
                } else {
                    showToast('Business listing deleted from database.', 'info');
                }
            } catch (err) {
                console.warn(err);
                showToast('Business removed locally; database sync failed.', 'error');
            }
        }

        renderBusinessesTable();
        renderDashboardKPIs();
    }

    // ==============================================================================
    // 8. PROFESSIONALS MANAGEMENT (CRUD)
    // ==============================================================================
    function renderProDirectoryTable() {
        const tbody = document.getElementById('proDirectoryTableBody');
        if (!tbody) return;

        const filterCat = document.getElementById('proCategoryFilter')?.value || 'all';
        const searchKeyword = (document.getElementById('globalSearchInput')?.value || '').toLowerCase();

        let list = state.professionals.filter(p => p.is_approved);

        if (filterCat !== 'all') {
            list = list.filter(p => p.category === filterCat);
        }
        if (searchKeyword) {
            list = list.filter(p =>
                (p.fullname && p.fullname.toLowerCase().includes(searchKeyword)) ||
                (p.professional_title && p.professional_title.toLowerCase().includes(searchKeyword)) ||
                (p.skills && p.skills.toLowerCase().includes(searchKeyword)) ||
                (p.specialization && p.specialization.toLowerCase().includes(searchKeyword)) ||
                (p.current_organization && p.current_organization.toLowerCase().includes(searchKeyword)) ||
                (p.location && p.location.toLowerCase().includes(searchKeyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon-wrap"><svg class="admin-icon-xl" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg></div>No verified professionals found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(p => `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(p.profile_photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop')}" class="entity-thumb" style="border-radius: 50%;" alt="Photo">
                        <div>
                            <div class="entity-name">${escapeHtml(p.fullname)}</div>
                            <div class="entity-sub">${escapeHtml(p.professional_title)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="cell-category-title">${escapeHtml(p.category)}</div>
                    <div class="cell-category-sub" style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(p.specialization || p.domain_expertise || '')}">${escapeHtml(p.specialization || p.domain_expertise || '')}</div>
                </td>
                <td>${escapeHtml(p.location)} &bull; ${escapeHtml(p.experience_years ? p.experience_years + ' yrs' : 'N/A')}</td>
                <td>${escapeHtml(p.current_organization || 'Independent')}</td>
                <td>
                    <span class="badge badge-approved">
                        <span class="badge-dot"></span> Verified
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="action-btn" title="Revoke Verification" onclick="window.ThalamAdmin.toggleProApproval('${p.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            <span>Revoke</span>
                        </button>
                        <button class="action-btn" title="Edit Profile" onclick="window.ThalamAdmin.openEditProModal('${p.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            <span>Edit</span>
                        </button>
                        <button class="action-btn delete" title="Delete Profile" onclick="window.ThalamAdmin.deletePro('${p.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderProRegistrationTable() {
        const tbody = document.getElementById('proRegistrationTableBody');
        if (!tbody) return;

        const filterDomain = document.getElementById('proRegDomainFilter')?.value || 'all';
        const searchKeyword = (document.getElementById('globalSearchInput')?.value || '').toLowerCase();

        let list = state.professionals.filter(p => !p.is_approved);

        if (filterDomain !== 'all') {
            list = list.filter(p => p.category === filterDomain);
        }
        if (searchKeyword) {
            list = list.filter(p =>
                (p.fullname && p.fullname.toLowerCase().includes(searchKeyword)) ||
                (p.professional_title && p.professional_title.toLowerCase().includes(searchKeyword)) ||
                (p.skills && p.skills.toLowerCase().includes(searchKeyword)) ||
                (p.specialization && p.specialization.toLowerCase().includes(searchKeyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon-wrap"><svg class="admin-icon-xl" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>All professional applicants verified! No pending applications.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(p => `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(p.profile_photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop')}" class="entity-thumb" style="border-radius: 50%;" alt="Photo">
                        <div>
                            <div class="entity-name">${escapeHtml(p.fullname)}</div>
                            <div class="entity-sub">${escapeHtml(p.professional_title)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="cell-category-title">${escapeHtml(p.category)}</div>
                    <div class="cell-category-sub" style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(p.specialization || p.domain_expertise || '')}">${escapeHtml(p.specialization || p.domain_expertise || '')}</div>
                </td>
                <td>${escapeHtml(p.location)} &bull; ${escapeHtml(p.experience_years ? p.experience_years + ' yrs' : 'N/A')}</td>
                <td>${escapeHtml(p.phone || p.email || 'N/A')}</td>
                <td>
                    <span class="badge badge-pending">
                        <span class="badge-dot"></span> Verification Pending
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="action-btn approve" title="Approve & Publish to Directory" onclick="window.ThalamAdmin.toggleProApproval('${p.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Approve</span>
                        </button>
                        <button class="action-btn" title="Inspect Credentials & Edit" onclick="window.ThalamAdmin.openEditProModal('${p.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            <span>Review</span>
                        </button>
                        <button class="action-btn delete" title="Reject Application" onclick="window.ThalamAdmin.deletePro('${p.id}')">
                            <svg class="admin-icon admin-icon-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderProfessionalsTable() {
        renderProDirectoryTable();
        renderProRegistrationTable();
    }

    async function pushProToSupabase(item) {
        if (!window.ThalamSupabase || typeof window.ThalamSupabase.getSupabase !== 'function') return false;
        const client = window.ThalamSupabase.getSupabase();
        if (!client) return false;

        // Use the local admin session (sessionStorage) — no Supabase Auth session required
        if (!state.authenticated || !state.currentUser) {
            item._supabaseSyncError = 'Admin session not found. Please log in to the admin panel first.';
            return false;
        }

        try {
            // Check if email column exists by probing the table schema
            let hasEmailColumn = true;
            try {
                await client.from('professionals').select('email').limit(1);
            } catch (probeErr) {
                hasEmailColumn = false;
            }

            const payload = {
                fullname: item.fullname || 'Unnamed Professional',
                professional_title: item.professional_title || 'Consultant',
                category: item.category || 'Professional Services',
                specialization: item.specialization || item.domain_expertise || '',
                current_organization: item.current_organization || '',
                designation: item.designation || '',
                experience_years: parseInt(item.experience_years || '0', 10) || 0,
                industry_experience: item.industry_experience || '',
                location: item.location || '',
                phone: item.phone || '',
                qualification: item.qualification || '',
                languages: item.languages || '',
                availability: item.availability || 'Available',
                skills: item.skills || '',
                website: item.website || '',
                linkedin: item.linkedin || '',
                instagram: item.instagram || '',
                profile_photo: item.profile_photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop',
                is_approved: Boolean(item.is_approved),
                created_at: item.created_at || new Date().toISOString()
            };

            // Only include email if the column exists in the live table
            if (hasEmailColumn && item.email) {
                payload.email = item.email || '';
            }

            const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
            if (isUuid(item.id)) {
                payload.id = item.id;
            }

            if (!payload.id && hasEmailColumn && item.email) {
                const { data: existingList } = await client
                    .from('professionals')
                    .select('id')
                    .ilike('email', item.email.trim())
                    .limit(1);
                if (existingList && existingList[0]?.id) payload.id = existingList[0].id;
            }
            if (!payload.id && item.fullname) {
                const { data: existingList } = await client
                    .from('professionals')
                    .select('id')
                    .ilike('fullname', item.fullname.trim())
                    .limit(1);
                if (existingList && existingList[0]?.id) payload.id = existingList[0].id;
            }

            // Try UPDATE first if we have an ID, then fall back to INSERT
            if (payload.id) {
                const { data: updData, error: updErr } = await client
                    .from('professionals')
                    .update(payload)
                    .eq('id', payload.id)
                    .select('id');

                if (!updErr && updData && updData.length > 0) {
                    if (updData[0]?.id) item.id = updData[0].id;
                    console.log('[Supabase] Professional updated:', item.fullname);
                    return true;
                }
                // UPDATE failed — row may not exist yet, fall through to INSERT
            }

            // INSERT new row
            const { data, error } = await client
                .from('professionals')
                .insert([payload])
                .select('id');

            if (error) throw error;
            if (data && data[0]?.id) item.id = data[0].id;
            console.log('[Supabase] Professional inserted:', item.fullname);
            return true;
        } catch (err) {
            item._supabaseSyncError = err.message || String(err);
            console.warn('[Supabase Sync Warning] Could not push professional to Supabase:', item._supabaseSyncError);
            return false;
        }
    }

    async function toggleProApproval(id) {
        const item = state.professionals.find(p => String(p.id) === String(id));
        if (!item) return;

        const previousApproval = Boolean(item.is_approved);
        item.is_approved = !previousApproval;
        persistData();

        let syncedToSupabase = await pushProToSupabase(item);
        if (!syncedToSupabase) {
            // Roll back local state so it stays consistent with Supabase
            item.is_approved = previousApproval;
            persistData();
            const errMsg = item._supabaseSyncError ? item._supabaseSyncError : 'Supabase sync failed. Check connection and try again.';
            showToast(`Could not update "${item.fullname}": ${errMsg}`, 'error');
            renderProfessionalsTable();
            renderDashboardKPIs();
            return;
        }

        const notifyMsg = item.is_approved
            ? `Profile Approved: "${item.fullname}" is now live on Find Professionals${syncedToSupabase ? ' & Synced to Supabase' : ''}!`
            : `Profile Revoked: "${item.fullname}" unlisted from directory.`;

        showToast(notifyMsg, 'success');
        renderProfessionalsTable();
        renderDashboardKPIs();
    }

    function openAddProModal() {
        const modal = document.getElementById('proModal');
        if (!modal) return;
        const title = document.getElementById('proModalTitle');
        if (title) title.textContent = 'Add Professional Profile';
        const form = document.getElementById('proForm');
        if (form) form.reset();
        const proGoogleDataField = document.getElementById('proGoogleDataField');
        if (proGoogleDataField) proGoogleDataField.style.display = 'none';
        const idInput = document.getElementById('proIdInput');
        if (idInput) idInput.value = '';
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    function openEditProModal(id) {
        const item = state.professionals.find(p => String(p.id) === String(id));
        if (!item) return;

        document.getElementById('proModalTitle').textContent = 'Edit Professional Profile';
        document.getElementById('proIdInput').value = item.id;
        document.getElementById('proNameInput').value = item.fullname || '';
        document.getElementById('proTitleInput').value = item.professional_title || '';
        document.getElementById('proCategoryInput').value = item.category || 'Legal & Compliance';
        document.getElementById('proDomainExpertiseInput').value = item.domain_expertise || '';
        document.getElementById('proSpecializationInput').value = item.specialization || '';
        document.getElementById('proOrgInput').value = item.current_organization || '';
        document.getElementById('proDesignationInput').value = item.designation || '';
        document.getElementById('proExpInput').value = item.experience_years || 0;
        document.getElementById('proIndustryExpInput').value = item.industry_experience || '';
        document.getElementById('proLocationInput').value = item.location || '';
        document.getElementById('proPhoneInput').value = item.phone || '';
        document.getElementById('proEmailInput').value = item.email || '';
        document.getElementById('proQualificationInput').value = item.qualification || '';
        document.getElementById('proLanguagesInput').value = item.languages || '';
        document.getElementById('proAvailabilityInput').value = item.availability || 'Consulting / Advisory';
        document.getElementById('proApprovedSelect').value = item.is_approved ? 'true' : 'false';
        document.getElementById('proSkillsInput').value = item.skills || '';
        document.getElementById('proWebsiteInput').value = item.website || '';
        document.getElementById('proLinkedinInput').value = item.linkedin || '';
        const instaEl = document.getElementById('proInstagramInput');
        if (instaEl) instaEl.value = item.instagram || '';

        document.getElementById('proPhotoInput').value = item.profile_photo || '';
        const proGoogleDataField = document.getElementById('proGoogleDataField');
        const proGoogleDataInput = document.getElementById('proGoogleDataInput');
        if (proGoogleDataField && proGoogleDataInput && item.google_row_data) {
            proGoogleDataField.style.display = '';
            proGoogleDataInput.value = JSON.stringify(item.google_row_data, null, 2);
        }

        document.getElementById('proModal').classList.add('active');
        document.getElementById('proModal').style.display = 'flex';
    }

    async function saveProfessional(e) {
        e.preventDefault();
        const id = document.getElementById('proIdInput').value;
        const isEdit = Boolean(id);

        const proData = {
            fullname: document.getElementById('proNameInput').value.trim(),
            professional_title: document.getElementById('proTitleInput').value.trim(),
            category: document.getElementById('proCategoryInput').value,
            domain_expertise: document.getElementById('proDomainExpertiseInput').value.trim(),
            specialization: document.getElementById('proSpecializationInput').value.trim() || document.getElementById('proDomainExpertiseInput').value.trim(),
            current_organization: document.getElementById('proOrgInput').value.trim(),
            designation: document.getElementById('proDesignationInput').value.trim(),
            experience_years: parseInt(document.getElementById('proExpInput').value) || 0,
            industry_experience: document.getElementById('proIndustryExpInput').value.trim(),
            location: document.getElementById('proLocationInput').value.trim(),
            phone: document.getElementById('proPhoneInput').value.trim(),
            email: document.getElementById('proEmailInput').value.trim(),
            qualification: document.getElementById('proQualificationInput').value.trim(),
            languages: document.getElementById('proLanguagesInput').value.trim(),
            availability: document.getElementById('proAvailabilityInput').value,
            skills: document.getElementById('proSkillsInput').value.trim(),
            website: document.getElementById('proWebsiteInput').value.trim(),
            linkedin: document.getElementById('proLinkedinInput').value.trim(),
            instagram: document.getElementById('proInstagramInput')?.value.trim() || '',

            profile_photo: document.getElementById('proPhotoInput').value.trim() || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop',
            is_approved: document.getElementById('proApprovedSelect').value === 'true'
        };

        if (isEdit) {
            const idx = state.professionals.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) {
                state.professionals[idx] = { ...state.professionals[idx], ...proData, updated_at: new Date().toISOString() };
                

                const synced = await pushProToSupabase({ ...state.professionals[idx] });
                showToast(synced ? 'Professional profile updated in Supabase!' : 'Profile updated locally; Supabase sync failed.', synced ? 'success' : 'error');
            }
        } else {
            const newId = 'p-' + Date.now();
            const newPro = {
                id: newId,
                ...proData,
                created_at: new Date().toISOString()
            };
            state.professionals.unshift(newPro);

            const synced = await pushProToSupabase(newPro);
            showToast(synced ? 'New professional added to Supabase!' : 'New professional added locally; Supabase sync failed.', synced ? 'success' : 'error');
        }

        persistData();
        closeModal('proModal');
        renderProfessionalsTable();
        renderDashboardKPIs();
    }

    async function deletePro(id) {
        const item = state.professionals.find(p => String(p.id) === String(id));
        if (!item) return;

        if (!confirm(`Are you sure you want to remove "${item.fullname}" from professionals directory?`)) {
            return;
        }

        state.professionals = state.professionals.filter(p => String(p.id) !== String(id));
        persistData();

        const client = window.ThalamSupabase && window.ThalamSupabase.getSupabase ? window.ThalamSupabase.getSupabase() : null;

        if (!client) {
            showToast('Profile removed locally (offline mode).', 'info');
        } else if (isLocalId(id)) {
            // Local fake ID — look up real Supabase UUID by fullname + email
            try {
                let query = client.from('professionals').select('id').eq('fullname', item.fullname);
                if (item.email) query = query.eq('email', item.email);
                const { data: found } = await query.maybeSingle();
                if (found?.id) {
                    const { error } = await client.from('professionals').delete().eq('id', found.id);
                    if (error) {
                        showToast(`Warning: Could not delete from database. ${error.message}`, 'error');
                    } else {
                        showToast('Professional profile deleted from database.', 'info');
                    }
                } else {
                    showToast('Profile removed (no matching database record found).', 'info');
                }
            } catch (err) {
                console.warn('[Supabase] Delete professional by name/email lookup failed:', err);
                showToast('Profile removed locally; database sync failed.', 'error');
            }
        } else {
            try {
                const { error } = await client.from('professionals').delete().eq('id', id);
                if (error) {
                    console.warn('[Supabase Sync Warning] Could not delete professional:', error);
                    showToast(`Warning: Could not delete from database. ${error.message}`, 'error');
                } else {
                    showToast('Professional profile deleted from database.', 'info');
                }
            } catch (err) {
                console.warn(err);
                showToast('Profile removed locally; database sync failed.', 'error');
            }
        }

        renderProfessionalsTable();
        renderDashboardKPIs();
    }


    // ==============================================================================
    // 9. TRUSTED PARTNERS MANAGEMENT
    // ==============================================================================
    function renderPartnersTable() {
        const tbody = document.getElementById('partnersTableBody');
        if (!tbody) return;

        const searchKeyword = (document.getElementById('globalSearchInput')?.value || '').toLowerCase();
        let list = state.partners;

        if (searchKeyword) {
            list = list.filter(p =>
                (p.partner_name && p.partner_name.toLowerCase().includes(searchKeyword)) ||
                (p.partner_type && p.partner_type.toLowerCase().includes(searchKeyword)) ||
                (p.category && p.category.toLowerCase().includes(searchKeyword)) ||
                (p.contact_person && p.contact_person.toLowerCase().includes(searchKeyword)) ||
                (p.location && p.location.toLowerCase().includes(searchKeyword)) ||
                (p.email && p.email.toLowerCase().includes(searchKeyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon-wrap"><svg class="admin-icon-xl" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>No trusted partners found matching criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(p => {
            const isApproved = !!p.is_approved;
            return `
            <tr>
                <td>
                    <div class="logo-cell">
                        <img src="${escapeHtml(p.logo_url || 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=100&auto=format&fit=crop')}" class="entity-thumb" alt="Logo" onerror="this.src='https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=100&auto=format&fit=crop'">
                        <div>
                            <div class="entity-name">${escapeHtml(p.partner_name || p.organization_name || 'Unnamed Partner')}</div>
                            <div class="entity-sub">${escapeHtml(p.website_url || p.website || '')}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge-category">${escapeHtml(p.partner_type || p.category || 'Strategic Partner')}</span>
                </td>
                <td>
                    <div class="contact-name">${escapeHtml(p.contact_person || 'N/A')}</div>
                    <div class="contact-sub">${escapeHtml(p.designation || '')} ${p.email ? '&bull; ' + escapeHtml(p.email) : ''}</div>
                </td>
                <td>${escapeHtml(p.location || 'Tamil Nadu')}</td>
                <td>
                    <span class="status-pill ${isApproved ? 'approved' : 'pending'}">
                        ${isApproved ? 'Approved &amp; Listed' : 'Pending Review'}
                    </span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="action-btn ${isApproved ? '' : 'approve'}" title="${isApproved ? 'Unlist / Revoke' : 'Approve & List on Public Site'}" onclick="window.ThalamAdmin.togglePartnerApproval('${p.id}')">
                            <svg class="admin-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <button class="action-btn" title="Edit Partner Details" onclick="window.ThalamAdmin.openEditPartnerModal('${p.id}')">
                            <svg class="admin-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="action-btn delete" title="Delete Partner" onclick="window.ThalamAdmin.deletePartner('${p.id}')">
                            <svg class="admin-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    }

    async function pushPartnerToSupabase(item) {
        if (!window.ThalamSupabase || typeof window.ThalamSupabase.getSupabase !== 'function') return false;
        const client = window.ThalamSupabase.getSupabase();
        if (!client) return false;

        try {
            const payload = {
                id: String(item.id),
                partner_name: item.partner_name || item.organization_name || 'Unnamed Partner',
                partner_type: item.partner_type || item.category || 'Strategic Partner',
                category: item.category || item.partner_type || 'Strategic Partner',
                contact_person: item.contact_person || '',
                designation: item.designation || '',
                location: item.location || '',
                email: item.email || '',
                phone: item.phone || '',
                website_url: item.website_url || item.website || '',
                logo_url: item.logo_url || 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=100&auto=format&fit=crop',
                description: item.description || '',
                is_approved: true,
                created_at: item.created_at || new Date().toISOString()
            };

            const { data, error } = await client
                .from('partners')
                .upsert([payload], { onConflict: 'id' });

            if (error) throw error;
            console.log('[Supabase Listing Sync] Partner pushed to Supabase:', item.partner_name);
            return true;
        } catch (err) {
            console.warn('[Supabase Sync Warning] Could not push partner to Supabase:', err.message);
            return false;
        }
    }

    async function togglePartnerApproval(id) {
        const item = state.partners.find(p => String(p.id) === String(id));
        if (!item) return;

        item.is_approved = !item.is_approved;
        persistData();
        renderPartnersTable();
        refreshDashboard();

        if (item.is_approved) {
            const pushed = await pushPartnerToSupabase(item);
            if (pushed) {
                showToast(`"${item.partner_name || 'Partner'}" approved & published to Supabase!`, 'success');
            } else {
                showToast(`"${item.partner_name || 'Partner'}" approved locally (Supabase offline/sync pending)`, 'info');
            }
        } else {
            if (window.ThalamSupabase && typeof window.ThalamSupabase.getSupabase === 'function') {
                const client = window.ThalamSupabase.getSupabase();
                if (client) {
                    try {
                        await client.from('partners').update({ is_approved: false }).eq('id', item.id);
                    } catch (e) {
                        console.warn('Could not revoke partner approval in Supabase:', e);
                    }
                }
            }
            showToast(`"${item.partner_name || 'Partner'}" unlisted from public directory`, 'info');
        }
    }

    function openAddPartnerModal() {
        document.getElementById('adminPartnerModalTitle').textContent = 'Add Trusted Partner';
        document.getElementById('adminPartnerForm').reset();
        document.getElementById('adminPartnerIdInput').value = '';
        document.getElementById('adminPartnerApprovedSelect').value = 'true';
        document.getElementById('adminPartnerModal').classList.add('active');
    }

    function openEditPartnerModal(id) {
        const p = state.partners.find(item => String(item.id) === String(id));
        if (!p) return;

        document.getElementById('adminPartnerModalTitle').textContent = 'Edit Trusted Partner';
        document.getElementById('adminPartnerIdInput').value = p.id;
        document.getElementById('adminPartnerOrgInput').value = p.partner_name || p.organization_name || '';
        document.getElementById('adminPartnerCategoryInput').value = p.category || p.partner_type || 'Incubators & Accelerators';
        document.getElementById('adminPartnerLocationInput').value = p.location || '';
        document.getElementById('adminPartnerContactInput').value = p.contact_person || '';
        document.getElementById('adminPartnerDesignationInput').value = p.designation || '';
        document.getElementById('adminPartnerEmailInput').value = p.email || '';
        document.getElementById('adminPartnerPhoneInput').value = p.phone || '';
        document.getElementById('adminPartnerWebsiteInput').value = p.website_url || p.website || '';
        document.getElementById('adminPartnerApprovedSelect').value = p.is_approved ? 'true' : 'false';
        document.getElementById('adminPartnerLogoInput').value = p.logo_url || '';
        document.getElementById('adminPartnerDescInput').value = p.description || '';

        document.getElementById('adminPartnerModal').classList.add('active');
    }

    async function savePartner(e) {
        if (e) e.preventDefault();

        const id = document.getElementById('adminPartnerIdInput').value;
        const isApproved = document.getElementById('adminPartnerApprovedSelect').value === 'true';

        const partnerData = {
            id: id || 'partner-' + Date.now(),
            partner_name: document.getElementById('adminPartnerOrgInput').value.trim(),
            partner_type: document.getElementById('adminPartnerCategoryInput').value,
            category: document.getElementById('adminPartnerCategoryInput').value,
            location: document.getElementById('adminPartnerLocationInput').value.trim(),
            contact_person: document.getElementById('adminPartnerContactInput').value.trim(),
            designation: document.getElementById('adminPartnerDesignationInput').value.trim(),
            email: document.getElementById('adminPartnerEmailInput').value.trim(),
            phone: document.getElementById('adminPartnerPhoneInput').value.trim(),
            website_url: document.getElementById('adminPartnerWebsiteInput').value.trim(),
            logo_url: document.getElementById('adminPartnerLogoInput').value.trim(),
            description: document.getElementById('adminPartnerDescInput').value.trim(),
            is_approved: isApproved,
            updated_at: new Date().toISOString()
        };

        if (id) {
            const idx = state.partners.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) {
                state.partners[idx] = { ...state.partners[idx], ...partnerData };
            }
        } else {
            partnerData.created_at = new Date().toISOString();
            state.partners.unshift(partnerData);
        }

        persistData();
        renderPartnersTable();
        refreshDashboard();
        closeModal('adminPartnerModal');

        if (isApproved) {
            const pushed = await pushPartnerToSupabase(partnerData);
            if (pushed) {
                showToast(`Partner "${partnerData.partner_name}" saved & pushed to Supabase!`, 'success');
            } else {
                showToast(`Partner "${partnerData.partner_name}" saved successfully!`, 'success');
            }
        } else {
            showToast(`Partner "${partnerData.partner_name}" saved as pending review`, 'success');
        }
    }

    async function deletePartner(id) {
        if (!confirm('Are you sure you want to permanently delete this partner entry?')) return;

        state.partners = state.partners.filter(p => String(p.id) !== String(id));
        persistData();
        renderPartnersTable();
        refreshDashboard();

        if (window.ThalamSupabase && typeof window.ThalamSupabase.getSupabase === 'function') {
            const client = window.ThalamSupabase.getSupabase();
            if (client) {
                try {
                    await client.from('partners').delete().eq('id', id);
                } catch (e) {
                    console.warn('Could not delete partner in Supabase:', e);
                }
            }
        }
        showToast('Partner record deleted successfully', 'success');
    }

    // ==============================================================================
    // 9b. INQUIRIES & LEADS MANAGEMENT
    // ==============================================================================
    function renderInquiriesTable() {
        const tbody = document.getElementById('inquiriesTableBody');
        if (!tbody) return;

        const searchKeyword = (document.getElementById('globalSearchInput')?.value || '').toLowerCase();
        let list = state.inquiries;

        if (searchKeyword) {
            list = list.filter(inq =>
                (inq.id && inq.id.toLowerCase().includes(searchKeyword)) ||
                (inq.client_name && inq.client_name.toLowerCase().includes(searchKeyword)) ||
                (inq.company && inq.company.toLowerCase().includes(searchKeyword)) ||
                (inq.category && inq.category.toLowerCase().includes(searchKeyword)) ||
                (inq.email && inq.email.toLowerCase().includes(searchKeyword)) ||
                (inq.type && inq.type.toLowerCase().includes(searchKeyword))
            );
        }

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon-wrap"><svg class="admin-icon-xl" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div>No inquiries or leads found matching criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(inq => `
            <tr>
                <td><strong>${escapeHtml(inq.id || '')}</strong></td>
                <td><span class="badge-category">${escapeHtml(inq.type || 'Support')}</span></td>
                <td>
                    <div class="entity-name">${escapeHtml(inq.client_name || inq.name || 'Anonymous')}</div>
                    <div class="entity-sub">${escapeHtml(inq.company || inq.organization || '')}</div>
                </td>
                <td>
                    <div style="font-weight: 500;">${escapeHtml(inq.category || inq.subject || 'General Inquiry')}</div>
                    <div style="font-size: 11px; color: var(--th-slate-500);">Budget: ${escapeHtml(inq.budget || 'Unspecified')}</div>
                    ${inq.message ? `<div style="font-size: 11px; color: var(--th-slate-600); margin-top: 4px; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(inq.message)}">${escapeHtml(inq.message)}</div>` : ''}
                </td>
                <td>
                    <div style="font-size: 12px;">
                        <div>${escapeHtml(inq.email || '')}</div>
                        <div style="color: var(--th-slate-500);">${escapeHtml(inq.phone || '')}</div>
                    </div>
                </td>
                <td>
                    <select class="filter-select" style="padding: 4px 8px; font-size: 12px;" onchange="window.ThalamAdmin.updateInquiryStatus('${inq.id}', this.value)">
                        <option value="New Lead" ${inq.status === 'New Lead' ? 'selected' : ''}>New Lead</option>
                        <option value="In Discussion" ${inq.status === 'In Discussion' ? 'selected' : ''}>In Discussion</option>
                        <option value="Proposal Sent" ${inq.status === 'Proposal Sent' ? 'selected' : ''}>Proposal Sent</option>
                        <option value="Converted" ${inq.status === 'Converted' ? 'selected' : ''}>Converted</option>
                        <option value="Closed / Archived" ${inq.status === 'Closed / Archived' ? 'selected' : ''}>Closed</option>
                    </select>
                </td>
            </tr>
        `).join('');
    }

    function updateInquiryStatus(id, newStatus) {
        const inq = state.inquiries.find(i => i.id === id);
        if (!inq) return;
        inq.status = newStatus;
        persistData();
        showToast(`Ticket ${id} status updated to: ${newStatus}`, 'success');
    }

    // ==============================================================================
    // 10. EXPORT & UTILITIES
    // ==============================================================================
    function exportData(type, format) {
        let dataset = [];
        let filename = `thaalam_${type}_${new Date().toISOString().slice(0, 10)}`;

        if (type === 'businesses') dataset = state.businesses;
        else if (type === 'professionals') dataset = state.professionals;
        else if (type === 'partners') dataset = state.partners;
        else if (type === 'inquiries') dataset = state.inquiries;

        if (format === 'json') {
            const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
            downloadBlob(blob, `${filename}.json`);
        } else {
            // CSV
            if (dataset.length === 0) {
                showToast('No records to export', 'error');
                return;
            }
            const keys = Object.keys(dataset[0]);
            const csvRows = [
                keys.join(','),
                ...dataset.map(row => keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(','))
            ];
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `${filename}.csv`);
        }

        showToast(`Exported ${dataset.length} records (${format.toUpperCase()})`, 'success');
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function closeModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.remove('active');
            m.style.display = 'none';
        }
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-body">
                <span>${escapeHtml(message)}</span>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 4000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function setElText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function refreshDashboard() {
        renderDashboardKPIs();
        // Only re-render the active tab to avoid unnecessary DOM work
        if (state.activeTab === 'biz-directory') renderBizDirectoryTable();
        else if (state.activeTab === 'biz-registration') renderBizRegistrationTable();
        else if (state.activeTab === 'pro-directory') renderProDirectoryTable();
        else if (state.activeTab === 'pro-registration') renderProRegistrationTable();
        else if (state.activeTab === 'partners') renderPartnersTable();
        else if (state.activeTab === 'inquiries') renderInquiriesTable();
        else {
            // Dashboard tab — render the two preview tables
            renderRecentBusinesses();
            renderRecentProfessionals();
        }
    }

    // ==============================================================================
    // 11. INITIALIZATION & EVENT LISTENERS
    // ==============================================================================


    function setupEventListeners() {
        // Login form listener
        const loginForm = document.getElementById('adminLoginForm') || document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

        // Demo login button
        const demoBtn = document.getElementById('demoAutoLoginBtn');
        if (demoBtn) {
            demoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                quickDemoLogin();
            });
        }

        // Google login button
        const googleBtn = document.getElementById('googleLoginBtn');
        if (googleBtn) {
            googleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showToast('Use the Supabase administrator login for secure publishing.', 'error');
            });
        }

        // Password visibility toggle
        const passToggle = document.getElementById('passwordToggleBtn');
        if (passToggle) {
            passToggle.addEventListener('click', () => {
                const passInput = document.getElementById('adminPassword');
                if (!passInput) return;
                const eyeOpen = passToggle.querySelector('.eye-open');
                const eyeClosed = passToggle.querySelector('.eye-closed');
                if (passInput.type === 'password') {
                    passInput.type = 'text';
                    if (eyeOpen) eyeOpen.style.display = 'none';
                    if (eyeClosed) eyeClosed.style.display = 'block';
                } else {
                    passInput.type = 'password';
                    if (eyeOpen) eyeOpen.style.display = 'block';
                    if (eyeClosed) eyeClosed.style.display = 'none';
                }
            });
        }

        // Forgot password notice
        document.getElementById('forgotPassLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Use the Supabase administrator email and password created in Supabase Authentication.');
        });

        // Sidebar toggle for mobile
        const sidebar = document.getElementById('adminSidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
            if (sidebar) {
                const isOpen = sidebar.classList.toggle('open');
                if (backdrop) backdrop.classList.toggle('active', isOpen);
            }
        });
        backdrop?.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('open');
            backdrop.classList.remove('active');
        });

        // Sidebar navigation click
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = item.getAttribute('data-tab');
                if (tab) {
                    e.preventDefault();
                    switchTab(tab);
                }
            });
        });

        // Signout button
        document.getElementById('btnSignout')?.addEventListener('click', handleSignout);

        // Global search input
        document.getElementById('globalSearchInput')?.addEventListener('input', () => {
            if (state.activeTab === 'biz-directory') renderBizDirectoryTable();
            else if (state.activeTab === 'biz-registration') renderBizRegistrationTable();
            else if (state.activeTab === 'pro-directory') renderProDirectoryTable();
            else if (state.activeTab === 'pro-registration') renderProRegistrationTable();
            else if (state.activeTab === 'partners') renderPartnersTable();
            else if (state.activeTab === 'inquiries') renderInquiriesTable();
        });

        // Filter dropdowns
        document.getElementById('bizSectorFilter')?.addEventListener('change', renderBizDirectoryTable);
        document.getElementById('bizRegStatusFilter')?.addEventListener('change', renderBizRegistrationTable);
        document.getElementById('proCategoryFilter')?.addEventListener('change', renderProDirectoryTable);
        document.getElementById('proRegDomainFilter')?.addEventListener('change', renderProRegistrationTable);

    }

    function initAdmin() {
        console.log('[Thaalam Admin] Initializing master portal controller...');
        loadSavedData();
        checkExistingAuth();
        setupEventListeners();
        refreshDashboard();
        syncWithSupabase();


        console.log('[Thaalam Admin] Controller initialized successfully.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdmin);
    } else {
        initAdmin();
    }

    // Expose Admin API globally
    window.ThalamAdmin = {
        switchTab,
        renderBizDirectoryTable,
        renderBizRegistrationTable,
        renderProDirectoryTable,
        renderProRegistrationTable,
        renderRecentBusinesses,
        renderRecentProfessionals,
        toggleBizApproval,
        openAddBizModal,
        openEditBizModal,
        saveBusiness,
        deleteBiz,
        toggleProApproval,
        openAddProModal,
        openEditProModal,
        saveProfessional,
        deletePro,
        renderPartnersTable,
        openAddPartnerModal,
        openEditPartnerModal,
        savePartner,
        togglePartnerApproval,
        deletePartner,
        updateInquiryStatus,
        exportData,
        closeModal,
        showToast,
        syncWithSupabase,
        removeDuplicates,
        resetAdminState,
        handleSignout,
        quickDemoLogin
    };

})();
