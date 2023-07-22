/* https://stackoverflow.com/a/44134328/21380804 */
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');   // convert to Hex and prefix "0" if needed
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function setInputEnabled(inputElt, isEnabled) {
    if (isEnabled) {
        inputElt.removeAttribute('disabled')
    } else {
        inputElt.setAttribute('disabled', 'true')
    }
}

function getTbody(obj) {
    let tbody = document.createElement('tbody')
    for (let k in obj) {
        const v = obj[k]

        let grayOut = ''
        let displayValue = v
        if (v === null) {
            displayValue = 'null'
            grayOut = ' class="null-value-row"'
        } else if (typeof v === 'object') {
            if('value' in v && 'unit' in v){
             displayValue = `${v['value']} ${v['unit']}`
            }else {
                displayValue = `<table>${getTbody(v).outerHTML}</table>`
            }
        }
        let row = $(`<tr${grayOut}><td>${k}</td><td>${displayValue}</td></tr>`)
        $(tbody).append(row)
    }
    return tbody
}

function parseIfNumber(maybeNumber){
    let parsed = parseFloat(maybeNumber)
    if(isNaN(parsed)){
        return maybeNumber
    }else{
        return parsed
    }
}

function getUrlHash() {
    return atob(new URL(location.href).hash.replace('#', ''))
}

function setUrlHash(urlHash) {
    let url = new URL(location.href)
    url.hash = btoa(urlHash)
    location.href = url
}
