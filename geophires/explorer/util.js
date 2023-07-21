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

function getTbody(obj){
    let tbody = document.createElement('tbody')
    for(let k in obj){
        let v = obj[k]
        if(typeof v === 'object'){
            v = `<table>${getTbody(v).outerHTML}</table>`
        }
        $(tbody).append(`<tr><td>${k}</td><td>${v}</td></tr>`)
    }
    return tbody
}
