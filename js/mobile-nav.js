/**
 * THAALAM - UNIFIED MOBILE SIDEBAR DRAWER CONTROLLER
 * Manages mobile drawer toggle, backdrop overlays, accordion submenus,
 * scroll locks, and navbar auto-hide across all pages.
 */

(function () {
    'use strict';

    function initMobileNavigation() {
        const header = document.querySelector('header');
        if (!header) return;

        // 1. Ensure Drawer Overlay exists
        let overlay = document.getElementById('navDrawerOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'navDrawerOverlay';
            overlay.className = 'nav-drawer-overlay';
            header.appendChild(overlay);
        }

        // 2. Ensure Mobile Nav Toggle Button exists
        let navToggle = document.getElementById('mobileNavToggle');
        if (!navToggle) {
            navToggle = document.createElement('button');
            navToggle.id = 'mobileNavToggle';
            navToggle.className = 'mobile-nav-toggle';
            navToggle.setAttribute('aria-label', 'Toggle navigation menu');
            navToggle.setAttribute('aria-expanded', 'false');
            navToggle.innerHTML = '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
            header.appendChild(navToggle);
        }

        // 3. Ensure Nav Menu has the drawer structure
        const navMenu = header.querySelector('nav');
        if (!navMenu) return;
        navMenu.classList.add('nav-drawer');

        // Check if drawer header exists; if not, prepend it
        let drawerHeader = navMenu.querySelector('.nav-drawer-header');
        if (!drawerHeader) {
            drawerHeader = document.createElement('div');
            drawerHeader.className = 'nav-drawer-header';

            // Find current logo img src or fallback
            const logoImg = header.querySelector('.logo img');
            const logoSrc = logoImg ? logoImg.getAttribute('src') : 'images/logo2.png';

            drawerHeader.innerHTML = `
                <div class="drawer-brand">
                    <img src="${logoSrc}" alt="Thaalam" class="drawer-logo">
                    <span class="drawer-title">THAALAM</span>
                </div>
                <button class="nav-drawer-close" id="navDrawerClose" aria-label="Close menu">&times;</button>
            `;
            navMenu.insertBefore(drawerHeader, navMenu.firstChild);
        }

        const navCloseBtn = document.getElementById('navDrawerClose');

        // 4. Open / Close State Handler
        function toggleSidebar(open) {
            const shouldOpen = open !== undefined ? open : !navMenu.classList.contains('nav-open');
            if (shouldOpen) {
                navMenu.classList.add('nav-open');
                navToggle.classList.add('active');
                navToggle.setAttribute('aria-expanded', 'true');
                overlay.classList.add('active');
                document.body.classList.add('nav-locked');
            } else {
                navMenu.classList.remove('nav-open');
                navToggle.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
                overlay.classList.remove('active');
                document.body.classList.remove('nav-locked');
                // Close any open accordions inside drawer
                navMenu.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
            }
        }

        // Toggle button click
        navToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleSidebar();
        });

        // Close button click
        if (navCloseBtn) {
            navCloseBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleSidebar(false);
            });
        }

        // Backdrop click to close
        overlay.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleSidebar(false);
        });

        // 5. Accordion Dropdown Toggles for Mobile
        const dropdowns = navMenu.querySelectorAll('.dropdown');
        dropdowns.forEach(dropdown => {
            const btn = dropdown.querySelector('.dropdown-btn');
            if (!btn) return;

            btn.addEventListener('click', function (e) {
                if (window.innerWidth <= 900) {
                    e.preventDefault();
                    e.stopPropagation();
                    const isAlreadyOpen = dropdown.classList.contains('open');
                    dropdowns.forEach(d => d.classList.remove('open'));
                    if (!isAlreadyOpen) {
                        dropdown.classList.add('open');
                    }
                }
            });
        });

        // Close sidebar on link click (for same-page anchor links)
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function () {
                if (window.innerWidth <= 900) {
                    toggleSidebar(false);
                }
            });
        });

        // 6. Escape Key Listener
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && navMenu.classList.contains('nav-open')) {
                toggleSidebar(false);
            }
        });

        // 7. Reset on Desktop Resize
        window.addEventListener('resize', function () {
            if (window.innerWidth > 900 && navMenu.classList.contains('nav-open')) {
                toggleSidebar(false);
            }
        });

        // 8. Auto-Hide Navbar on Scroll Down, Reveal on Scroll Up
        let lastScrollTop = 0;
        window.addEventListener('scroll', function () {
            // Do not hide navbar if sidebar drawer is open
            if (navMenu.classList.contains('nav-open')) return;

            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            if (currentScroll > 45 && currentScroll > lastScrollTop) {
                header.classList.add('nav-hidden');
            } else {
                header.classList.remove('nav-hidden');
            }
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
        }, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileNavigation);
    } else {
        initMobileNavigation();
    }
})();
