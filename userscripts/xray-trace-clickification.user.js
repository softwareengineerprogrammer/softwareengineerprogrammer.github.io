// ==UserScript==
// @name         XRay Trace Clickification
// @namespace    http://jonathanpezzino.com
// @version      0.1
// @description  try to take over the world!
// @author       softwareengineerprogrammer
// @match        https://*.console.aws.amazon.com/cloudwatch/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    const clickifiedAttr = 'xray_trace_clickified';

    let clickify = function () {
        let traceIdElts = document.querySelectorAll(`div[data-test-id$="xray_trace_id-value"]:not([${clickifiedAttr}])`);
        console.debug('Found', traceIdElts.length, 'unclickified trace ID elements');
        traceIdElts.forEach(it => {
            let traceId = it.innerText;
            console.debug('Found xray trace ID:', traceId);
            let xrayLink = document.createElement('a');
            xrayLink.innerText = 'trace';
            xrayLink.target = '_blank';
            let region = 'us-west-2' // FIXME TODO
            xrayLink.href = `https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#servicelens:traces/${traceId}?~(query~()~context~())`
            it.querySelector('.kvp-value').appendChild(xrayLink);
            it.setAttribute(clickifiedAttr, 'true');
        });
    };

    setInterval(clickify, 2000);
})();
