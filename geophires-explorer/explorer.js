// Initialize and add the map
        let map;




        async function initMap() {
            // Request needed libraries.
            //@ts-ignore
            const { Map, InfoWindow } = await google.maps.importLibrary("maps");
            const {
                AdvancedMarkerElement,
                PinElement
            } = await google.maps.importLibrary("marker");

            const spaceNeedlePosition = {
                lat: 47.620415417603574,
                lng: -122.34921062363883
            };
            map = new Map(document.getElementById("map"), {
                zoom: 4,
                center: spaceNeedlePosition,
                mapId: "DEMO_MAP_ID",
            });

            let facilities = [
// Facility_ID,Facility_Name,CO2e_kt,Unit_Count,direct_use_heat_breakeven_price_USD_per_MMBTU,geophires_summary,Unit_Temp_degC,Temp_3000m,Temp_plus15C_Available_3000m,Latitude,Longitude,Temp_Gradient_degC_per_km
[1001804,"MARTINEZ REFINING COMPANY LLC",8639.0,52,4.19,"{'capex_million_USD': 55.73, 'opex_million_USD_per_year': 2.16, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 4.19}",220.0,250,true,38.02,-122.12,75.0],
[1007390,"Martinez Renewable Fuel Facility",5152.0,104,4.19,"{'capex_million_USD': 55.73, 'opex_million_USD_per_year': 2.16, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 4.19}",220.0,250,true,38.03,-122.07,75.0],
[1006395,"SAN FRANCISCO REFINERY AT RODEO",5508.0,100,4.78,"{'capex_million_USD': 50.25, 'opex_million_USD_per_year': 1.81, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 4.78}",220.0,250,true,38.04,-122.25,62.5],
[1002916,"ARCHER DANIEL MIDLAND COMPANY",845.0,21,8.39,"{'capex_million_USD': 38.9, 'opex_million_USD_per_year': 1.03, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 8.39}",50.0,125,true,41.42,-97.29,37.5],
[1000401,"Tate & Lyle-Loudon",368.0,30,10.74,"{'capex_million_USD': 28.54, 'opex_million_USD_per_year': 0.59, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 10.74}",50.0,100,true,35.74,-84.32,37.5],
[1000304,"CARGILL CORN MILLING-WAHPETON FACILITY",101.0,5,10.74,"{'capex_million_USD': 28.54, 'opex_million_USD_per_year': 0.59, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 10.74}",50.0,100,true,46.37,-96.66,37.5],
[1005661,"Archer Daniels Midland Co.",3104.0,45,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,39.87,-88.89,25.0],
[1006047,"ADM CORN PROCESSING",1719.0,39,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.92,-91.69,25.0],
[1006637,"CARGILL INCORPORATED",1320.0,14,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,39.82,-84.17,25.0],
[1006208,"ADM CORN PROCESSING",1303.0,48,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.82,-90.21,25.0],
[1000261,"Ingredion Incorporated Argo Plant",786.0,35,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.78,-87.82,25.0],
[1000334,"Tate & Lyle",681.0,30,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,39.85,-88.93,25.0],
[1006425,"Cargill Corn Milling North America",644.0,5,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.53,-96.1,25.0],
[1007881,"CARGILL INC - EDDYVILLE",489.0,10,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.14,-92.64,25.0],
[1001293,"ROQUETTE AMERICA INC",448.0,36,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,40.39,-91.4,25.0],
[1004114,"GRAIN PROCESSING CORP",420.0,16,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.4,-91.06,25.0],
[1006525,"CARGILL INC-CEDAR RAPIDS",411.0,10,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.97,-91.65,25.0],
[1004640,"GRAIN PROCESSING CORP",342.0,9,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,38.63,-87.23,25.0],
[1005988,"TATE & LYLE LAFAYETTE SOUTH",281.0,12,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,40.38,-86.84,25.0],
[1001945,"ARCHER DANIELS MIDLAND",243.0,7,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,44.47,-95.78,25.0],
[1000407,"Cargill Corn Milling",240.0,10,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,35.08,-90.14,25.0],
[1002632,"INGREDION INCORPORATED",215.0,6,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.97,-91.67,25.0],
[1001675,"TATE & LYLE SAGAMORE",183.0,11,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,40.44,-86.86,25.0],
[1005479,"Ingredion Incorporated, Indianapolis Plant",128.0,30,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,39.74,-86.17,25.0],
[1001090,"Cargill Texturizing Solutions",111.0,5,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",50.0,100,true,41.69,-87.52,25.0],
[1002928,"GRAYMONT WESTERN US INC. CRICKET MOUNTAIN",0.0,24,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",120.0,150,true,38.94,-112.82,25.0],
[1002601,"LHOIST NORTH AMERICA -  NATIVIDAD PLANT",0.0,24,20.36,"{'capex_million_USD': 35.1, 'opex_million_USD_per_year': 0.65, 'direct_use_heat_breakeven_price_USD_per_MMBTU': 20.36}",120.0,150,true,36.75,-121.61,25.0]
            ]

            let facilities_by_name = {}

            const infoWindow = new InfoWindow();

            const getAbbrev = function(str){
                let abbrev = ''
                let words = str.split(' ')
                for(let i = 0; i < Math.min(words.length,3); i++){
                    let word = words[i]
                    let firstLetter = word.substring(0,1)
                    abbrev += firstLetter
                }
                return abbrev
            }

            for(const f in facilities){
                let facility = facilities[f]
                let facility_name = facility[1]
                let facility_lat = facility[9]
                let facility_lng = facility[10]
                let facility_geophires_summary = facility[5]
                let temp_3000m = facility[7]

                facilities_by_name[facility_name] = {
                    facility_name: facility_name,
                    facility_lat: facility_lat,
                    facility_lng: facility_lng,
                    facility_geophires_summary: facility_geophires_summary,
                    temp_3000m: temp_3000m,
                    gradient: facility[11]
                }

                const pin = new PinElement({
                    glyph: `${getAbbrev(facility_name)}`,
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

                marker.addListener("click", ({ domEvent, latLng }) => {
                    const { target } = domEvent;
                    let facility_data = facilities_by_name[marker.title]

                    infoWindow.close();
                    infoWindow.setContent(marker.title);
                    infoWindow.open(marker.map, marker);
                    console.log('Facility clicked:',facility_data)
                    //document.getElementById('geophires_input_parameters').value = JSON.stringify(facility_data, null, 4)
                    document.getElementById('geophires_input_parameters').value = JSON.stringify({
                        "End-Use Option": 2,
                        "Reservoir Model": 1,
                        "Time steps per year": 6,
                        "Reservoir Depth": 3,
                        "Gradient 1": facility_data.gradient,
                        "Maximum Temperature": facility_data.temp_3000m
                    }, null, 4)
                    document.getElementById('results').innerText = JSON.stringify(JSON.parse(
                        facility_data.facility_geophires_summary.replaceAll("'",'"')), null, 4)
                });

            }
        }

        initMap();
