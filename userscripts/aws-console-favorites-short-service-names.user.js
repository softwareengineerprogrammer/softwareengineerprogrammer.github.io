// ==UserScript==
// @name         AWS Console Favorites Short Service Names
// @namespace    https://github.com/softwareengineerprogrammer
// @version      1.4
// @description  Use short service names to reduce space usage
// @author       softwareengineerprogrammer
// @match        https://*.console.aws.amazon.com/*
// @updateURL https://softwareengineerprogrammer.github.io/userscripts/aws-console-favorites-short-service-names.user.js
// @downloadURL https://softwareengineerprogrammer.github.io/userscripts/aws-console-favorites-short-service-names.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const RENAMES = {
        "Route 53": "r53",
        "Lambda": "λ",
        "CloudFormation": "cfn",
        "CloudWatch": "cw",
        "CodePipeline": "pipe",
        "Certificate Manager": "acm",
        "AWS Organizations": "orgs",
        "API Gateway": "apig",
        "Amazon WorkMail": "workmail",
        "Amazon Simple Email Service": "ses",
        "AWS Amplify": "amplify",
        "CodeCommit": "code",
        "Elastic Container Registry": "ecr",
        "IAM": "iam",
        "S3": "s3",
        "CloudFront": "cdn",
        "DynamoDB": "ddb"
    }

    var renameWhenLoaded = function () {
        var faveElts = document.querySelectorAll("a[data-testid*='awsc-nav-favorites-bar'] span")

        if (!faveElts || faveElts.length < 1) {
            console.debug('Didn\'t find fave elts, will retry', faveElts)
            setTimeout(renameWhenLoaded, 2000)
            return;
        }

        console.debug('Got fave elts:', faveElts)

        for (let faveEltIdx in faveElts) {
            let faveElt = faveElts[faveEltIdx]
            if (faveElt.innerText in RENAMES) {
                console.log("Found service link to rename with innertext matching rename", faveElt)
                faveElt.innerText = RENAMES[faveElt.innerText]
            }
        }

    }

    setTimeout(renameWhenLoaded, 2000)
})();
