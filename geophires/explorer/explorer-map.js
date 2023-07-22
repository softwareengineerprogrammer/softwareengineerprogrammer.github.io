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

    const archerDanielMidlandPosition = {
        lat:	41.42,
        lng:	-97.29
    }

    map = new Map(document.getElementById("map"), {
        zoom: 4.5,
        center: archerDanielMidlandPosition,
        mapId: "geophires_direct_use_heat_explorer",
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

    let dataFilePath = 'data/gtw-facility-analysis_2023-07-20-1689893839.csv'

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

            let facilityGeophiresSummary = getFacilityGeophiresSummary(facilityCsvObj)

            let facility = {
                facility_name: facilityCsvObj.Facility_Name,
                facility_id: facilityCsvObj.Facility_ID,
                CO2e_kt: parseFloat(facilityCsvObj.CO2e_kt),
                unit_Temp_degC: parseFloat(facilityCsvObj.Unit_Temp_degC),
                temp_3000m_degC: parseInt(facilityCsvObj.Temp_3000m),
                gradient_degC_per_km: parseFloat(facilityCsvObj.Temp_Gradient_degC_per_km),
                temp_plus15C_Available_3000m: facilityCsvObj.Temp_plus15C_Available_3000m === "true",
                position: {
                    lat: parseFloat(facilityCsvObj.Latitude),
                    lng: parseFloat(facilityCsvObj.Longitude)
                },
                geophires_summary: facilityGeophiresSummary
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

            marker.addListener('click', ({domEvent, latLng}) => {
                const {target} = domEvent;

                let facilityData = facilitiesByName[marker.title]
                console.log('Facility clicked:', facilityData)

                infoWindow.close();

                let facilityDisplay = Object.assign({}, facilityData)
                delete facilityDisplay.facility_name
                delete facilityDisplay.geophires_summary
                let facilityId = facilityDisplay.facility_id
                facilityDisplay.facility_id = `<a
                    href="https://ghgdata.epa.gov/ghgp/service/facilityDetail/2021?id=${facilityId}&ds=E&et=&popup=true"
                    target="_blank"
                    title="Open EPA GHGRP Facility Details in a separate window">
                        ${facilityId}
                    </a>`
                let facilityName = facilityData.facility_name

                let infoTable = $(`<table class="mui-table"><thead><tr><th colspan="2">${facilityName}</th></tr></thead>`)
                $(infoTable).append(getTbody(facilityDisplay))
                let infoWindowContent = infoTable[0]

                infoWindow.setContent(infoWindowContent);

                infoWindow.open(marker.map, marker);

                setFormInputParameters(
                    {
                    "End-Use Option": 2,
                    "Reservoir Model": 1,
                    "Time steps per year": 6,
                    "Reservoir Depth": 3,
                    "Gradient 1": facilityData.gradient_degC_per_km,
                    //"Maximum Temperature": facilityData.temp_3000m_degC
                    "Maximum Temperature": 400
                })

                let summaryTable = $('<table class="mui-table mui-table--bordered"></table>')
                $(summaryTable).append($("<thead><tr><th colspan='2'>Summary of Results (Pre-Computed)</th></tr></thead>"))
                $(summaryTable).append(getTbody(facilityData.geophires_summary))

                $('#results').empty()
                    //.append(infoTable.clone())
                    .append(summaryTable)
            });

        }
    });
});
