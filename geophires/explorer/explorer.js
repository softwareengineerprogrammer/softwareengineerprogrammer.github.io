// Initialize and add the map
let map;


async function initMap() {
    // Request needed libraries.
    //@ts-ignore
    const {Map} = await google.maps.importLibrary("maps");

    const graymontCricketPosition = {
        lat: 38.937677322387735,
        lng: -112.81371837200508
    }
    map = new Map(document.getElementById("map"), {
        zoom: 4.5,
        center: graymontCricketPosition,
        mapId: "DEMO_MAP_ID",
        mapTypeId: 'terrain',
        streetViewControl: false,
    });
}

initMap().then(async () => {

    const {
        AdvancedMarkerElement,
        PinElement,
    } = await google.maps.importLibrary("marker");

    const {InfoWindow} = await google.maps.importLibrary("maps");

    let dataFilePath = 'gtw-facility-analysis_2023-07-20-1689893839.csv'

    $.get(dataFilePath, function (csv_data) {
        let facilities = $.csv.toObjects(csv_data).reverse()

        let facilitiesByName = {}

        const infoWindow = new InfoWindow();

        const getFacilityNameAbbreviation = function (str) {
            let abbrev = ''
            let words = str.split(' ')
            for (let i = 0; i < Math.min(words.length, 3); i++) {
                let word = words[i]
                let firstLetter = word.substring(0, 1)
                abbrev += firstLetter
            }
            return abbrev
        }

        const getFacilityGeophiresSummary = function (facilityCsvObject) {
            try {
                return JSON.parse(facilityCsvObject.geophires_summary.replaceAll("'", '"'))
            } catch (e) {
                return {}
            }
        }

        for (const f in facilities) {
            let facilityCsvObj = facilities[f]

            if (!facilityCsvObj.geophires_summary) {
                // TODO don't exclude these, probably
                continue
            }
            let facility_geophires_summary = getFacilityGeophiresSummary(facilityCsvObj)

            let facility = {
                facility_name: facilityCsvObj.Facility_Name,
                CO2e_kt: parseFloat(facilityCsvObj.CO2e_kt),
                geophires_summary: facility_geophires_summary,
                unit_Temp_degC: parseFloat(facilityCsvObj.Unit_Temp_degC),
                temp_3000m_degC: parseInt(facilityCsvObj.Temp_3000m),
                gradient_degC_per_km: parseFloat(facilityCsvObj.Temp_Gradient_degC_per_km),
                temp_plus15C_Available_3000m: facilityCsvObj.Temp_plus15C_Available_3000m === "true",
                position: {
                    lat: parseFloat(facilityCsvObj.Latitude),
                    lng: parseFloat(facilityCsvObj.Longitude)
                }
            }

            facilitiesByName[facility.facility_name] = facility

            let bgColor = "#FF0000"
            if (!facility.temp_plus15C_Available_3000m) {
                let percent_unit_temp = (facility.temp_3000m_degC / facility.unit_Temp_degC) * 100.0
                bgColor = hslToHex(240, percent_unit_temp, 100 - percent_unit_temp)
            }

            const pin = new PinElement({
                glyph: `${getFacilityNameAbbreviation(facility.facility_name)}`,
                background: bgColor,
            });

            let marker = new AdvancedMarkerElement({
                map: map,
                position: facility.position,
                title: facility.facility_name,
                content: pin.element,
            });

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

            marker.addListener('click', ({domEvent, latLng}) => {
                const {target} = domEvent;
                let facilityData = facilitiesByName[marker.title]

                infoWindow.close();

                // let infoWindowContent = JSON.stringify(facilityData, null, 4)
                //     .replaceAll('\n', '<br/>').replaceAll(' ', '&nbsp;')
                let infoTable = $('<table class="mui-table">')
                $(infoTable).append(getTbody(facilityData))
                let infoWindowContent = infoTable[0]

                infoWindow.setContent(infoWindowContent);

                infoWindow.open(marker.map, marker);
                console.log('Facility clicked:', facilityData)
                document.getElementById('geophires_input_parameters').value = JSON.stringify({
                    "End-Use Option": 2,
                    "Reservoir Model": 1,
                    "Time steps per year": 6,
                    "Reservoir Depth": 3,
                    "Gradient 1": parseFloat(facilityData.gradient_degC_per_km),
                    "Maximum Temperature": parseInt(facilityData.temp_3000m_degC)
                }, null, 4)

                let summaryTable = document.createElement('table')
                summaryTable.classList.add('mui-table')
                summaryTable.classList.add('mui-table--bordered')
                $(summaryTable).append($("<thead><tr><th colspan='2'>Summary of Results (Pre-Computed)</th></tr></thead>"))
                $(summaryTable).append(getTbody(facilityData.geophires_summary))

                $('#results').empty()
                    .append(summaryTable)
            });

        }
    });
});
