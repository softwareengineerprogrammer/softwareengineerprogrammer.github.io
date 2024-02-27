// ==UserScript==
// @name         GH Issue Title in URL
// @namespace    http://github.com/softwareengineerprogrammer
// @version      1.0
// @description  Automatically add descriptive title query parameter to GitHub issue URLs to make them human-readable/referenceable
// @author       softwareengineerprogrammer
// @match        https://github.com/*/issues/*
// @match        https://github.com/*/*/issues/*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/gh-issue-title-in-url.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/gh-issue-title-in-url.user.js
// ==/UserScript==

(function() {
    'use strict';

    let titleSnippet = document.querySelector('h1 .markdown-title').innerText.replaceAll(' ', '+').replaceAll('`','')

    console.debug('GH issue', titleSnippet)
    // Construct URLSearchParams object instance from current URL querystring.
    let queryParams = new URLSearchParams(window.location.search)

    // Set new or modify existing parameter value.
    // queryParams.set("title", titleSnippet)
    queryParams.set("title", 'GH_ISSUE_TITLE')
    let queryParamsToString = queryParams.toString()
    // console.debug('Encoded URL component index in query params.toString()',queryParamsToString.indexOf(encodeURIComponent(titleSnippet)))
    // console.debug('queryParams title', queryParams.get('title'))

    // Replace current querystring with the new one.
    history.replaceState(null, null, "?"+queryParamsToString.replace('GH_ISSUE_TITLE', titleSnippet))
})();
