// ==UserScript==
// @name         GitHub Autoload Large Diffs
// @namespace    http://github.com/softwareengineerprogrammer
// @version      0.2
// @description  I want to see large diffs
// @author       softwareengineerprogrammer
// @match        https://github.com/*/*/pull/*/files*
// @grant        none
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/gh-autoload-large-diffs.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/gh-autoload-large-diffs.user.js
// ==/UserScript==

(function() {
    'use strict';

    const max_tries = 5

    let autoloadLargeDiffs = function(tries){
        let diffBtns = document.querySelectorAll('button.load-diff-button')

        if(!diffBtns.length){
            if(tries < max_tries){
                setTimeout(function(){autoloadLargeDiffs(tries+1)}, 2000);
            }else{
                console.debug('did not find any large diff buttons')
            }

            return
        }

        diffBtns.forEach(it => {
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
    }
    setTimeout(function(){autoloadLargeDiffs(0)}, 2000);
})();
