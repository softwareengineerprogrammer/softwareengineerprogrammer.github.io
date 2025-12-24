// ==UserScript==
// @name         EC2 Console Auto-Refresh
// @namespace    https://github.com/softwareengineerprogrammer
// @version      2025-12-24
// @author       softwareengineerprogrammer
// @match        https://*.us-west-2.console.aws.amazon.com/ec2/home?region=us-west-2
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/ec2-console-auto-refresh.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/ec2-console-auto-refresh.user.js
// ==/UserScript==

(function() {
    'use strict';

    setInterval(
        function(){
            document.querySelector('button[title="Refresh instances"]').click()
        },
        30000
    )
})();
