// Initialize and add the map
let map;


async function initMap() {
    // Request needed libraries.
    //@ts-ignore
    const {Map, InfoWindow} = await google.maps.importLibrary("maps");

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
        // console.log('Got facility analysis data:', facilities)

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
                temp_plus15C_Available_3000m: facilityCsvObj.Temp_plus15C_Available_3000m === "true"
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

            let facility_lat = parseFloat(facilityCsvObj.Latitude)
            let facility_lng = parseFloat(facilityCsvObj.Longitude)
            let marker = new AdvancedMarkerElement({
                map: map,
                position: {
                    lat: facility_lat,
                    lng: facility_lng
                },
                title: facility.facility_name,
                content: pin.element,
            });

            marker.addListener("click", ({domEvent, latLng}) => {
                const {target} = domEvent;
                let facility_data = facilitiesByName[marker.title]

                infoWindow.close();

                let infoWindowContent = JSON.stringify(facility_data, null, 4)
                    .replaceAll('\n', '<br/>').replaceAll(' ', '&nbsp;')
                infoWindow.setContent(infoWindowContent);

                infoWindow.open(marker.map, marker);
                console.log('Facility clicked:', facility_data)
                document.getElementById('geophires_input_parameters').value = JSON.stringify({
                    "End-Use Option": 2,
                    "Reservoir Model": 1,
                    "Time steps per year": 6,
                    "Reservoir Depth": 3,
                    "Gradient 1": parseFloat(facility_data.gradient_degC_per_km),
                    "Maximum Temperature": parseInt(facility_data.temp_3000m_degC)
                }, null, 4)

                document.getElementById('results').innerText = JSON.stringify(facility_data.geophires_summary, null, 4)
            });

        }
    });
});