// ==UserScript==
// @name         XRay Trace Clickification
// @namespace    https://github.com/softwareengineerprogrammer
// @version      0.1
// @description  Make xray trace IDs generated by lambda powertools clickable in CW dashboards
// @author       softwareengineerprogrammer
// @match        https://*.console.aws.amazon.com/cloudwatch/*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/xray-trace-clickification.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/xray-trace-clickification.user.js
// ==/UserScript==

(function () {
    'use strict';
    const CLICKIFIED_ATTR = 'xray_trace_clickified';

    const blankTabImg = document.createElement('img');
    blankTabImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAtElEQVQoU7WSwRHCIBBF/4IkF3uJReh4toCMZViDZTiWoU3EKizAUwis2TjMZBggucgF5sNj2c8nbczZgVukhh32k2w2z3ibfiK9NNDFm87am2hyucyOhxNIb2U9gRp0D4eSlUdRVdXFsz+A3UfgVWCAFKkHMb+ltUVwDvm+vwZPimAMzdvIgiUoa04Jyj51qVK+x7o+KuadGJH6mlXm/A8cA9SlIpeq6IAG4IaKIc/kTyL6BavLmPJRH8tYAAAAAElFTkSuQmCC';
    blankTabImg.width = '7';
    blankTabImg.height = blankTabImg.width;
    blankTabImg.style = 'margin-bottom: 3.5px; margin-left: 1px;';

    let clickify = function () {
        let traceIdElts = document.querySelectorAll(`div[data-test-id$="xray_trace_id-value"]:not([${CLICKIFIED_ATTR}])`);
        console.debug('Found', traceIdElts.length, 'unclickified trace ID elements');
        traceIdElts.forEach(it => {
            let traceId = it.innerText;
            console.debug('Found xray trace ID:', traceId);
            let xrayLink = document.createElement('a');
            xrayLink.style = 'margin-left: 0.25em;'
            xrayLink.innerHTML = `trace${blankTabImg.outerHTML}`;
            xrayLink.target = '_blank';
            let url = new URL(window.location.href);
            url.hash = `#servicelens:traces/${traceId}?~(query~()~context~())`;
            xrayLink.href = url.href;
            it.querySelector('.kvp-value').appendChild(xrayLink);
            it.setAttribute(CLICKIFIED_ATTR, 'true');
        });
    };

    setInterval(clickify, 2000);
})();
