function setLoading(isLoading) {
    let loader = document.getElementById('loading')
    if (isLoading) {
        loader.classList.remove('hidden')
    } else {
        loader.classList.add('hidden')
    }

    document.querySelectorAll('form input').forEach(
        (sb) => setInputEnabled(sb, !isLoading))

    document.querySelectorAll('form textarea').forEach(
        (ta) => setInputEnabled(ta, !isLoading))
}

function submitForm(oFormElement) {
    let parsed_params = JSON.parse(oFormElement.querySelector('textarea[name="geophires_input_parameters"]').value)

    let xhr = new XMLHttpRequest();
    xhr.onload = function () {
        console.log('Got response', xhr.responseText, xhr)
        setLoading(false)

        let resultsText = ''
        if (xhr.status !== 200) {
            resultsText = `Error: ${xhr.statusText}`
        } else {
            resultsText = xhr.responseText
        }

        //document.getElementById('results').innerText = resultsText
        let resultsTable = $('<table class="mui-table"></table>')
        let resultsData = JSON.parse(resultsText)
        for (let resultsKey in resultsData) {
            let resultsEntry = resultsData[resultsKey]
            $(resultsTable).append($(`<thead><tr><th colspan="2">${resultsKey}</th></tr></tr></thead>`))
            $(resultsTable).append(getTbody(resultsEntry))
        }
        //$(resultsTable).append(getTbody(resultsData))

        $('#results').empty()
            .append(resultsTable)
    }

    xhr.onerror = function () {
        console.log('xhr onerror triggered', xhr)
        setLoading(false)
        $('#results').append($('<span>&#9888;Unexpected GEOPHIRES error - could be caused by invalid GEOPHIRES parameters, i.e. Maximum Temperature > 400</span>'))
    }

    xhr.open(oFormElement.method, oFormElement.getAttribute("action"))
    xhr.send(JSON.stringify({
        'geophires_input_parameters': parsed_params
    }))

    setLoading(true)
    $('#results').empty()

    let hashParams = new URLSearchParams()
    hashParams.set('geophires_input_parameters', JSON.stringify(parsed_params))
    setUrlHash(hashParams.toString())

    return false
}

let GUIDED_PARAMS_FORM = null
let TEXT_INPUT_PARAMS_FORM = null

function setFormInputParameters(inputParameterObj){
    GUIDED_PARAMS_FORM.setInputParameters(inputParameterObj)
    TEXT_INPUT_PARAMS_FORM.setInputParameters(inputParameterObj)
}

$(document).ready(function () {
    GUIDED_PARAMS_FORM = new GeophiresParametersForm(
        $('#geophires_param_form'),
        function (params) {
            TEXT_INPUT_PARAMS_FORM.setInputParameters(params['geophires_input_parameters'])

            $('textarea[name="geophires_input_parameters"]')
                .val(JSON.stringify(params['geophires_input_parameters'], null, 4))
                .submit()
        }
    )

    TEXT_INPUT_PARAMS_FORM = new GeophiresTextInputParameters(
        $('#geophires_text_input_parameters'),
        function (params) {
            GUIDED_PARAMS_FORM.setInputParameters(params['geophires_input_parameters'])

            $('textarea[name="geophires_input_parameters"]')
                .val(JSON.stringify(params['geophires_input_parameters'], null, 4))
                .submit()
        })


    let defaultParams = {
        "End-Use Option": 2,
        "Reservoir Model": 1,
        "Time steps per year": 6,
        "Reservoir Depth": 3,
        "Gradient 1": 50,
        "Maximum Temperature": 400
    }

    console.log('URL hash is:', getUrlHash())
    let paramsFromHash = new URLSearchParams(getUrlHash()).get('geophires_input_parameters')
    console.log(`URL hash as search params: ${paramsFromHash}`)
    if(paramsFromHash){
        defaultParams = JSON.parse(paramsFromHash)
    }

    setFormInputParameters(defaultParams)
})
