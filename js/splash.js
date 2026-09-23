/**
 * THAALAM - UNIFIED SPLASH SCREEN CONTROLLER
 * Automatically shows a luxury cinematic splash screen when users open the page.
 * Style: "thaalam | DIRECTORY" + "Trusted Business Ecosystem"
 */
(function () {
    'use strict';

    // Prevent running multiple times
    if (window.__thaalamSplashInitialized) return;
    window.__thaalamSplashInitialized = true;

    // Do not run on standalone splash.html itself or index.html (which has its own hero intro)
    const p = window.location.pathname.toLowerCase();
    if (p.endsWith('splash.html') || p.endsWith('index.html') || p === '/' || p.endsWith('/')) return;

    function initSplashScreen() {
        // Find existing splash screen or create dynamic one
        let splash = document.getElementById('site-splash-screen') ||
                     document.getElementById('splash-screen') ||
                     document.querySelector('.thaalam-splash-overlay');

        if (!splash) {
            // Create splash container
            splash = document.createElement('div');
            splash.id = 'site-splash-screen';
            splash.className = 'thaalam-splash-overlay';
            splash.setAttribute('role', 'dialog');
            splash.setAttribute('aria-modal', 'true');
            splash.setAttribute('aria-label', 'Thaalam Directory');

            splash.innerHTML = `
                <div class="thaalam-splash-content">
                    <h1 class="thaalam-splash-logo-word">thaalam</h1>
                </div>

                <div class="thaalam-splash-progress">
                    <div class="thaalam-splash-progress-bar"></div>
                </div>
            `;

            if (document.body) {
                document.body.insertAdjacentElement('afterbegin', splash);
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    document.body.insertAdjacentElement('afterbegin', splash);
                });
            }
        }

        let isDismissed = false;
        let autoDismissTimer = null;

        function dismissSplash() {
            if (isDismissed) return;
            isDismissed = true;

            if (autoDismissTimer) {
                clearTimeout(autoDismissTimer);
                autoDismissTimer = null;
            }

            // Smooth fade & scale transition
            splash.classList.add('splash-hidden');

            // Dispatch global event for page scripts (hero typewriter, GSAP, etc.)
            window.dispatchEvent(new CustomEvent('thaalamSplashDismissed'));
            window.dispatchEvent(new CustomEvent('splashDismissed'));

            // Cleanup listeners
            cleanupListeners();

            // After animation ends, hide and detach
            setTimeout(() => {
                splash.style.display = 'none';
                if (splash.parentNode && splash.id === 'site-splash-screen') {
                    splash.parentNode.removeChild(splash);
                }
            }, 850);
        }

        function onKeyDown(e) {
            if (['Space', 'Enter', 'Escape', 'ArrowDown', 'PageDown'].includes(e.code) || [' ', 'Enter', 'Escape'].includes(e.key)) {
                dismissSplash();
            }
        }

        function onScrollOrTouch() {
            dismissSplash();
        }

        function onSplashClick() {
            dismissSplash();
        }

        function cleanupListeners() {
            splash.removeEventListener('click', onSplashClick);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('wheel', onScrollOrTouch);
            window.removeEventListener('touchmove', onScrollOrTouch);
        }

        // Attach listeners
        splash.addEventListener('click', onSplashClick);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('wheel', onScrollOrTouch, { passive: true });
        window.addEventListener('touchmove', onScrollOrTouch, { passive: true });

        // Auto-dismiss after 2.8s
        autoDismissTimer = setTimeout(dismissSplash, 2800);

        // Expose API
        window.ThaalamSplash = {
            element: splash,
            dismiss: dismissSplash
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSplashScreen);
    } else {
        initSplashScreen();
    }
})();
