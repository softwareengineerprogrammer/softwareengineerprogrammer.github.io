"use strict";

class GeophiresParametersForm {

    _getElt() {
        return $(this.$elt)
    }

    constructor($formElt, onSubmit) {
        this.$elt = $formElt

        $(this.$elt).submit(function () {
            let params_request = {
                'geophires_input_parameters': {}
            }


            $.map($($formElt).find('.geophires-parameters input[type="text"]'), function (value, index) {
                console.log('f', value, index)
                params_request['geophires_input_parameters'][value.name] = parseFloat(value.value)
            })

            console.log('r',JSON.stringify(params_request))
            onSubmit(params_request)

            return false
        })
    }

    setInputParameters(inputParameters) {
        this.inputParameters = inputParameters
        let elt = this._getElt()
        elt.empty()

        let this_ = this
        let tbl = $('<table class="mui-table geophires-parameters"></table>')
        for (let paramName in inputParameters) {
            let paramData = inputParameters[paramName]

            let removeButton = $(`<button type="button"  class="mui-btn mui-btn--small">X</button>`)
            removeButton.on("click", function () {
                this_._removeInputParameter(paramName)
            })
            tbl.append($(`
                <tr>
                    <td>
                        <label for="${paramName}">${paramName}</label>
                    </td>
                    <td>
                        <input type="text" name="${paramName}" value="${paramData}"/>
                    </td>
                </tr>
            `).append($('<td>').append(removeButton)))
        }

        elt.append(tbl)
        elt.append(`
            <div class="mui-divider"/>
            <input type="submit"
                           value="Run GEOPHIRES"
                           class="mui-btn mui-btn--primary mui-btn--raised" />`)
    }

    _removeInputParameter(paramName) {
        delete this.inputParameters[paramName]
        this.setInputParameters(this.inputParameters)
    }


}
