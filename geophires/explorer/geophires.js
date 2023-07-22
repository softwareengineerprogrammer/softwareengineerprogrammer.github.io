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
                if (value.name) {
                    params_request['geophires_input_parameters'][value.name] = parseIfNumber(value.value)
                }
            })

            console.log('Constructed params request object:', JSON.stringify(params_request))
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
                    <br/>
                    <div class="mui-divider"></div>
                    <br/>
                </td>
            </tr>

            <tr>
                <td colspan="3"><legend>Add Parameter</legend></td>
            </tr>
            <tr>
                <td>Name</td>
                <td colspan="2">Value</td>
            </tr>
            <tr>
                <td><input type="text" id="add_param_name"/></td>
                <td><input type="text" id="add_param_value"/></td>
                <td><button type="button" class="mui-btn" id="add_param_btn">Add</button></td>
            </tr>`)
        elt.append(tbl)

        $("#add_param_btn").on('click', function () {
            if($('#add_param_name').val()) {
                this_.inputParameters[$('#add_param_name').val()] = $('#add_param_value').val()
                this_.setInputParameters(this_.inputParameters)
            }
        })

        elt.append(`
                <div class="mui-divider"></div>
                <br/>
                <input type="submit"
                           value="Run GEOPHIRES"
                           class="mui-btn mui-btn--primary mui-btn--raised" />
                            <div class="mui-divider" style="clear:both;"></div>
        `)
    }

    _removeInputParameter(paramName) {
        delete this.inputParameters[paramName]
        this.setInputParameters(this.inputParameters)
    }
}

class GeophiresTextInputParameters {
    constructor($formElt) {
        $($formElt).append($(`
            <textarea rows="13"></textarea>
            <input type="submit"
            value="Run GEOPHIRES"
             class="mui-btn mui-btn--primary mui-btn--raised" />
        `))
        this.$textareaElt = $($formElt).find('textarea')
        //this.setInputParameters(inputParametersObj)
    }

    setInputParameters(inputParametersObj){
        this.inputParameters = inputParametersObj

        let txt = this.getParametersText()
        $(this.$textareaElt).val(txt)
        return txt
    }

    getParametersText(){
        let txt = ''
        for(let paramName in this.inputParameters){
            let paramValue = this.inputParameters[paramName]
            txt += `${paramName}, ${paramValue}\n`
        }
        return txt
    }
}
