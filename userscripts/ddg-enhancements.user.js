// ==UserScript==
// @name         DuckDuckGo Enhancements: Results in New Tab
// @namespace    https://softwareengineerprogrammer.github.io
// @version      1.0.0
// @description  Opens external DuckDuckGo search results in a new tab.
// @author       softwareengineerprogrammer
// @match        *://duckduckgo.com/*
// @match        *://*.duckduckgo.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    document.addEventListener('click', function(event) {
        const link = event.target.closest('#web_content_wrapper a[href]');

        if (link) {
            const href = link.getAttribute('href');

            if (href) {
                const isInternal = href.startsWith('/') || href.startsWith('#') || href.startsWith('javascript:');

                if (!isInternal) {
                    link.setAttribute('target', '_blank');
                    link.setAttribute('rel', 'noopener noreferrer');
                }
            }
        }
    }, true);
})();
