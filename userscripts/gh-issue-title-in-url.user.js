// ==UserScript==
// @name         GH Issue Title in URL
// @namespace    http://github.com/softwareengineerprogrammer
// @version      1.1
// @description  Automatically add descriptive title query parameter to GitHub issue URLs to make them human-readable/referenceable
// @author       softwareengineerprogrammer
// @match        https://github.com/*/issues/*
// @match        https://github.com/*/*/issues/*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/gh-issue-title-in-url.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/gh-issue-title-in-url.user.js
// ==/UserScript==

(function () {
    'use strict';

    let attempts = 0
    const MAX_ATTEMPTS = 69

    function setTitleQueryParam() {
        let issueTitleElt = document.querySelector('h1 .markdown-title')
        if (issueTitleElt === null) {
            attempts++
            if (attempts < MAX_ATTEMPTS) {
                setTimeout(setTitleQueryParam, 111)
            } else {
                console.debug('[gh-issue-title-in-url.user.js] Failed to find issue title element after', MAX_ATTEMPTS, 'attempts, giving up =(')
            }
            return
        }

        let titleSnippet = issueTitleElt.innerText

        const customReplacements = new Map([
            [' ', '+'],
            ['`', ''],
            ['<', 'gt'],
            ['>', 'lt'],
            ['℃', 'C']
        ])
        customReplacements.forEach(function (value, key, map) {
            titleSnippet = titleSnippet.replaceAll(key, value)
        })


        let queryParams = new URLSearchParams(window.location.search)
        queryParams.set("title", 'GH_ISSUE_TITLE')
        let queryParamsToString = queryParams.toString()

        // console.debug('Encoded URL component index in query params.toString()',queryParamsToString.indexOf(encodeURIComponent(titleSnippet)))
        // console.debug('queryParams title', queryParams.get('title'))

        let adjustedParams = queryParamsToString.replace('GH_ISSUE_TITLE', titleSnippet)
        adjustedParams = adjustedParams.replace(/%[0-9][A-F]/g, '')
        history.replaceState(null, null, "?" + adjustedParams)
    }

    setTitleQueryParam()
})();
