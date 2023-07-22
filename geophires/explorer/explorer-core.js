function setLoading(isLoading) {
    let loader = document.getElementById('loading')
    if (isLoading) {
        loader.classList.remove('hidden')
    } else {
        loader.classList.add('hidden')
    }

    setInputEnabled(document.querySelector('input[type="submit"]'), !isLoading)
    setInputEnabled(document.querySelector('textarea'), !isLoading)
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

    xhr.open(oFormElement.method, oFormElement.getAttribute("action"))
    xhr.send(JSON.stringify({
        'geophires_input_parameters': parsed_params
    }))

    setLoading(true)

    //let hash_params = new URLSearchParams()
    //hash_params.set('geophires_input_parameters', JSON.stringify(parsed_params))
    //setUrlHash(hash_params.toString())

    return false
}

let params_form = null
let params_text_input = null
$(document).ready(function () {
    params_text_input = new GeophiresTextInputParameters($('#geophires_text_input_parameters'))
    params_form = new GeophiresParametersForm(
        $('#geophires_param_form'),
        function (params) {
            params_text_input.setInputParameters(params['geophires_input_parameters'])

            $('textarea[name="geophires_input_parameters"]')
                .val(JSON.stringify(params['geophires_input_parameters'], null, 4))
                .submit()
        }
    )

    const defaultParams = {
        "End-Use Option": 2,
        "Reservoir Model": 1,
        "Time steps per year": 6,
        "Reservoir Depth": 3,
        "Gradient 1": 50,
        "Maximum Temperature": 400
    }

    params_form.setInputParameters(defaultParams)
    params_text_input.setInputParameters(defaultParams)
})
