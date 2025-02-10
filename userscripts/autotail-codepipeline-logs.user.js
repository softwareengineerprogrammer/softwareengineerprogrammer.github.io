// ==UserScript==
// @name         Auto-Tail CodePipeline Logs
// @namespace    http://softwareengineerprogrammer.github.io
// @version      0.1
// @description  un-papercut tail logs
// @author       softwareengineerprogrammer
// @match        https://*.console.aws.amazon.com/codesuite/codepipeline/pipelines/*/debug*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/autotail-codepipeline-logs.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/autotail-codepipeline-logs.user.js
// ==/UserScript==

(function () {
    'use strict';

    let maxTries = 10;
    let loop = function (tries) {
        let elt = document.querySelector('.dx-LogTab__header > awsui-button:nth-child(2) > button:nth-child(1) > span:nth-child(1)');
        if (elt) {
            console.debug('Found Tail Logs button...');

            setTimeout(function () {
                elt.click();
                console.debug('Clicked Tail Logs button.');
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
