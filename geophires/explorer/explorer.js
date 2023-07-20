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

    // let dataFilePath = 'gtw-facility-analysis_2023-07-20-1689889571.csv'
    let dataFilePath = 'gtw-facility-analysis_2023-07-20-1689890162.csv'

    $.get(dataFilePath, function (csv_data) {
        let facilities = $.csv.toObjects(csv_data)
        console.log('Got facility analysis data:', facilities)

        let facilities_by_name = {}

        const infoWindow = new InfoWindow();

        const getAbbrev = function (str) {
            let abbrev = ''
            let words = str.split(' ')
            for (let i = 0; i < Math.min(words.length, 3); i++) {
                let word = words[i]
                let firstLetter = word.substring(0, 1)
                abbrev += firstLetter
            }
            return abbrev
        }

        for (const f in facilities) {
            let facility = facilities[f]
            let facility_name = facility.Facility_Name
            let facility_lat = parseFloat(facility.Latitude)
            let facility_lng = parseFloat(facility.Longitude)
            let temp_3000m = parseInt(facility.Temp_3000m)

            let get_facility_geophires_summary = function () {
                try {
                    return JSON.parse(facility.geophires_summary.replaceAll("'", '"'))
                } catch (e) {
                    return {}
                }
            }
            let facility_geophires_summary = get_facility_geophires_summary()

            facilities_by_name[facility_name] = {
                facility_name: facility_name,
                CO2e_kt: facility[2],
                geophires_summary: facility_geophires_summary,
                unit_Temp_degC: parseFloat(facility.Unit_Temp_degC),
                temp_3000m_degC: temp_3000m,
                gradient_degC_per_km: facility.Temp_Gradient_degC_per_km,
                temp_plus15C_Available_3000m: facility.Temp_plus15C_Available_3000m == "true"
            }

            let bgColor = "#FF0000"
            if (facility.Temp_plus15C_Available_3000m !== "true") {
                bgColor = "#d3d3d3"
            }
            const pin = new PinElement({
                glyph: `${getAbbrev(facility_name)}`,
                background: bgColor,
            });

            let marker = new AdvancedMarkerElement({
                map: map,
                position: {
                    lat: facility_lat,
                    lng: facility_lng
                },
                title: facility_name,
                content: pin.element,
            });

            marker.addListener("click", ({domEvent, latLng}) => {
                const {target} = domEvent;
                let facility_data = facilities_by_name[marker.title]

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