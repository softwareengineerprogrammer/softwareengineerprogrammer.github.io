// ==UserScript==
// @name         Auto-Tail CodePipeline Logs
// @namespace    http://softwareengineerprogrammer.github.io
// @version      0.2
// @description  un-papercut tail logs
// @author       softwareengineerprogrammer
// @match        https://*.console.aws.amazon.com/codesuite/codepipeline/pipelines/*/debug*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/autotail-codepipeline-logs.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/autotail-codepipeline-logs.user.js
// ==/UserScript==

(function () {
    'use strict';

    function isHidden(el) {
        return el && (el.offsetParent === null);
    }

    const maxTries = 50;
    let loop = function (tries) {
        let elt = document.querySelector('.dx-LogTab__header > awsui-button:nth-child(2) > button:nth-child(1) > span:nth-child(1)');
        if (elt) {
            console.debug('Found Tail Logs button...');

            setTimeout(function () {
                elt.click();
                console.debug('Clicked Tail Logs button.');

                setTimeout(function () {
                    if (isHidden(document.querySelector('div.dx-StatusIndicator:nth-child(1)'))) {
                        console.debug('Tail Logs pane not showing, resuming search-n-click...');
                        loop(tries);
                    }
                }, 1000);

            }, 1000);
        } else if (tries < maxTries) {
            console.debug('Didn\'t find Tail Logs button, will try again...');
            setTimeout(function () {
                loop(tries + 1);
            }, 250);
        } else {
            console.debug('Giving up trying to click Tail Logs button');
        }
    };

    loop(0);
})();
