// ==UserScript==
// @name         GeoMap Auto-Agree & Defaults
// @namespace    http://github.com/softwareengineerprogrammer
// @version      1.7
// @description  Make GeoMap more usable
// @author       softwareengineerprogrammer
// @match        https://geomap.projectinnerspace.org/test*
// @match        https://geomap.projectinnerspace.org/geomap/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- UTILITIES ---

    function highlightElement(element, color = 'red') {
        if (!element) return;
        const originalOutline = element.style.outline;
        element.style.outline = `3px solid ${color}`;
        element.style.boxShadow = `0 0 10px ${color}`;
        setTimeout(() => {
            element.style.outline = originalOutline;
            element.style.boxShadow = '';
        }, 1000);
    }

    function simulateClick(element) {
        if (!element) return;

        console.log('[Userscript] ⚡ CLICKING BUTTON:', element);
        highlightElement(element, 'red'); // Visual confirmation for you

        // 1. Try Native Form Submit first (Cleanest way to trigger "onSubmit")
        const parentForm = element.closest('form');
        if (parentForm) {
            try {
                parentForm.requestSubmit(element);
                console.log('[Userscript] Triggered via form.requestSubmit()');
                return;
            } catch (e) {
            }
        }

        // 2. Mouse Event Chain (Standard React requirement)
        const eventOptions = {bubbles: true, cancelable: true, view: window, buttons: 1};
        element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        element.dispatchEvent(new MouseEvent('click', eventOptions));

        // 3. React Internal Prop Access (Fallback "God Mode")
        const reactKey = Object.keys(element).find(key => key.startsWith('__reactProps'));
        if (reactKey && element[reactKey].onClick) {
            console.log('[Userscript] Invoking React onClick prop directly');
            try {
                element[reactKey].onClick({
                    preventDefault: () => {
                    },
                    stopPropagation: () => {
                    },
                    nativeEvent: new MouseEvent('click', eventOptions),
                    target: element,
                    currentTarget: element
                });
            } catch (e) {
            }
        }
    }

    function setReactValue(element, value) {
        const lastValue = element.value;
        element.focus();
        element.value = value;
        // The React 16+ Hack: Overwrite the internal value tracker
        const tracker = element._valueTracker;
        if (tracker) tracker.setValue(lastValue);
        element.dispatchEvent(new Event('input', {bubbles: true}));
        element.dispatchEvent(new Event('change', {bubbles: true}));
        element.dispatchEvent(new Event('blur', {bubbles: true}));
    }

    // --- MAIN LOGIC ---

    function setLatLong(lat, lng) {
        const labels = Array.from(document.querySelectorAll('label'));

        // Retry if DOM isn't ready
        if (labels.length === 0) {
            setTimeout(() => setLatLong(lat, lng), 500);
            return;
        }

        labels.forEach(label => {
            const text = label.textContent.trim().toLowerCase();
            const container = label.parentElement;
            if (!container || container.offsetParent === null) return; // Skip invisible elements

            const input = container.querySelector('input');
            if (!input) return;

            if (text.startsWith('latitude')) {
                setReactValue(input, lat);
                highlightElement(input, '#00ff00'); // Highlight Green
            } else if (text.startsWith('longitude')) {
                setReactValue(input, lng);
                highlightElement(input, '#00ff00'); // Highlight Green
            }
        });
    }

    const setCapeStationLatLong = function () {
        const targetLat = 38.498766977413105;
        const targetLng = -112.91634316299478;

        try {
            console.log('--- Setting Cape Station Lat/Long ---');
            setLatLong(targetLat, targetLng);

            setTimeout(function () {
                // Find all buttons on the page
                const allButtons = Array.from(document.querySelectorAll('button'));

                // Filter specifically for the one that says "UPDATE"
                const updateBtn = allButtons.find(btn =>
                    btn.innerText.trim().toUpperCase() === 'UPDATE'
                );

                if (updateBtn) {
                    console.log('[Userscript] Found "UPDATE" button.');
                    simulateClick(updateBtn);
                } else {
                    console.error('[Userscript] ❌ Could not find a button with text "UPDATE".');
                    // Log available buttons to help debug if it fails again
                    console.log('Available buttons:', allButtons.map(b => b.innerText.trim()));
                }
            }, 1000);
        } catch (e) {
            console.error('Error in sequence:', e);
        }
    };

    let clickAgree = function () {
        let btn = document.querySelector('.test_starting_popup-module--acknowledgeButton--4b14d') ||
            document.querySelector('.library_starting_popup-module--acknowledgeButton--50da6');

        if (btn) {
            btn.click();
            return;
        }
        setTimeout(clickAgree, 100);
    };

    clickAgree();
    setTimeout(setCapeStationLatLong, 3000);
})();
