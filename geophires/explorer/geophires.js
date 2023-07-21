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

            console.log('r', JSON.stringify(params_request))
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

            let removeButton = $(`<button type="button"  class="mui-btn mui-btn--small">Remove</button>`)
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

        tbl.append(`
            <tr>
                <td colspan="3">
                    <div class="mui-divider"></div>
                </td>
            </tr>
            <tr>
            <td>Add Parameter</td>
            <td><input type="text" id="add_param_name"/></td>
            <td>
                <button type="button" class="mui-btn" id="add_param_btn">Add</button>
            </td>
        </tr>`)
        elt.append(tbl)

        $("#add_param_btn").on('click', function () {
            this_.inputParameters[$('#add_param_name').val()] = ''
            this_.setInputParameters(this_.inputParameters)
        })

        elt.append(`
        <div class="mui-divider" style="clear:both;"></div>
            <input type="submit"
                           value="Run GEOPHIRES"
                           class="mui-btn mui-btn--primary mui-btn--raised" />
`)
    }

    _removeInputParameter(paramName) {
        delete this.inputParameters[paramName]
        this.setInputParameters(this.inputParameters)
    }


}
