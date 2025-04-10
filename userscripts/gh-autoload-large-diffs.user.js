// ==UserScript==
// @name         GitHub Autoload Large Diffs
// @namespace    http://github.com/softwareengineerprogrammer
// @version      0.1
// @description  I want to see large diffs
// @author       softwareengineerprogrammer
// @match        https://github.com/*/*/pull/*/files*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/gh-autoload-large-diffs.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/gh-autoload-large-diffs.user.js
// ==/UserScript==

(function() {
    'use strict';

    setTimeout(function(){
        document.querySelectorAll('button.load-diff-button').forEach(it => {
            let doLoad = true;
            try{
                let viewedElt = it.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector('form.js-toggle-user-reviewed-file-form input[value="viewed"]')
                let isMarkedViewed = viewedElt.checked || false;
                console.log(it, viewedElt, isMarkedViewed)
                doLoad = !isMarkedViewed
            }catch(e){
                console.warning('Failed determine whether large diff file has been marked as viewed',e)
            }

            if(doLoad) {
                it.click()
            }
        });
    }, 2000);
})();
