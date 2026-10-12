import fs from 'fs';
import path from 'path';
import 'dotenv/config';


const outputPath = path.resolve('../explorer/public/data/bodies.json');
// Code for future implementation, this gives the current day in correct format
// NOTE: If using later, you need to get tomorrow as well
// const now = new Date();
// const year = now.getFullYear();
// const day = now.getDate();
// const monthName = now.toLocaleString('default', { month: 'long' });
// const dateString = `${year}-${monthName}-${day}`
// console.log(dateString);

/*
Moon Link LSS: https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Moon
Sun Link LSS: https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Star
Planet Link LSS: https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Planet
Dwarf Planet Link LSS: https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Dwarf Planet
*/

const NASAparams = new URLSearchParams({
    format: 'json',
    COMMAND: '10',
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: '500@10',
    START_TIME: '2026-April-6',
    STOP_TIME: '2026-April-7',
    STEP_SIZE: '1d',
})

const regexInput = /X =\s*([\d.E+\-]+)\s+Y =\s*([\d.E+\-]+)\s+Z =\s*([\d.E+\-]+)/

async function buildHorizonsLookup() {
    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='MB'`;
    const response = await fetch(url);
    const json = await response.json();
    const raw = json.result;

    const lookup = {};
    const regex = /(\d+)\s{1,10}([A-Za-z][A-Za-z0-9 '\-]*?)(?=\s{2,}|\n|$)/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        const code = match[1].trim();
        const name = match[2].trim();
        lookup[name] = code;
    }

    // Manual overrides for known LSS and Horizons name mismatches
    lookup['Mercury'] = lookup['Mercury'] ?? '199';
    lookup['Venus'] = lookup['Venus'] ?? '299';
    lookup['Earth'] = lookup['Earth'] ?? '399';
    lookup['Mars'] = lookup['Mars'] ?? '499';
    lookup['Jupiter'] = lookup['Jupiter'] ?? '599';
    lookup['Saturn'] = lookup['Saturn'] ?? '699';
    lookup['Uranus'] = lookup['Uranus'] ?? '799';
    lookup['Neptune'] = lookup['Neptune'] ?? '899';
    lookup['Pluto'] = lookup['Pluto'] ?? '999';
    lookup['Sun'] = lookup['Sun'] ?? '10';
    lookup['Ceres'] = lookup['Ceres'] ?? '1';
    lookup['Eris'] = lookup['Eris'] ?? '136199';
    lookup['Haumea'] = lookup['Haumea'] ?? '136108';
    lookup['Makemake'] = lookup['Makemake'] ?? '136472';
    lookup['136199 Eris'] = '136199';
    lookup['136108 Haumea'] = '136108';
    lookup['136472 Makemake'] = '136472';
    lookup['1 Ceres'] = '1';

    return lookup;
}

const planetDataList = []



async function loadPlanetData(horizonsLookup) {
    const LSSPlanetLink = 'https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Planet';
    const LSSResponse = await fetch(LSSPlanetLink,
        {
            headers: {
                'Authorization': `Bearer ${process.env.LSS_API_KEY}`
            }
        }
    );

    const LSSjson = await LSSResponse.json();
    for (const currBody of LSSjson.bodies){
        const planetCommand = horizonsLookup[currBody.englishName];
        if (!planetCommand) {
            console.warn(`No Horizons code found for: ${currBody.englishName}`);
            continue;
        }
        NASAparams.set('COMMAND', planetCommand);
        const NASAurl = `https://ssd.jpl.nasa.gov/api/horizons.api?${NASAparams}`;
        const NASAresponse = await fetch(NASAurl);
        const NASAjson = await NASAresponse.json();
        const coords = NASAjson.result.match(regexInput)
        if (!coords) {
            console.warn(`No coords found for: ${currBody.englishName}`);
            continue;
        }
        const body = {
            id: currBody.id,
            name: currBody.englishName,
            meanRadiusKm: currBody.meanRadius,
            semimajorAxis: currBody.semimajorAxis,
            X: coords[1],
            Y: coords[2],
            Z: coords[3],
            parentId: null
        }
        planetDataList.push(body);
    }  
}

async function loadSunData(horizonsLookup) {
    const LSSSunLink = 'https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Star';
    const LSSResponse = await fetch(LSSSunLink,
        {
            headers: {
                'Authorization': `Bearer ${process.env.LSS_API_KEY}`
            }
        }
    );

    const LSSjson = await LSSResponse.json();
    for (const currBody of LSSjson.bodies){
        const planetCommand = horizonsLookup[currBody.englishName];
        if (!planetCommand) {
            console.warn(`No Horizons code found for: ${currBody.englishName}`);
            continue;
        }
        NASAparams.set('COMMAND', planetCommand);
        const NASAurl = `https://ssd.jpl.nasa.gov/api/horizons.api?${NASAparams}`;
        const NASAresponse = await fetch(NASAurl);
        const NASAjson = await NASAresponse.json();
        const coords = NASAjson.result.match(regexInput)
        if (!coords) {
            console.warn(`No coords found for: ${currBody.englishName}`);
            continue;
        }
        const body = {
            id: currBody.id,
            name: currBody.englishName,
            meanRadiusKm: currBody.meanRadius,
            semimajorAxis: currBody.semimajorAxis,
            X: coords[1],
            Y: coords[2],
            Z: coords[3],
            parentId: null
        }
        planetDataList.push(body);
    }  
}

async function loadDwarfPlanetData(horizonsLookup) {
    const LSSDwarfLink = 'https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Dwarf Planet';
    const LSSResponse = await fetch(LSSDwarfLink,
        {
            headers: {
                'Authorization': `Bearer ${process.env.LSS_API_KEY}`
            }
        }
    );

    const LSSjson = await LSSResponse.json();
    const ceresCheck = await fetch('https://api.le-systeme-solaire.net/rest/bodies/ceres', {
        headers: { 'Authorization': `Bearer ${process.env.LSS_API_KEY}` }
    });
    const ceresJson = await ceresCheck.json();
    for (const currBody of LSSjson.bodies){
        const planetCommand = horizonsLookup[currBody.englishName];
        if (!planetCommand) {
            console.warn(`No Horizons code found for: ${currBody.englishName}`);
            continue;
        }
        NASAparams.set('COMMAND', planetCommand);
        const NASAurl = `https://ssd.jpl.nasa.gov/api/horizons.api?${NASAparams}`;
        const NASAresponse = await fetch(NASAurl);
        const NASAjson = await NASAresponse.json();
        const coords = NASAjson.result.match(regexInput)
        if (!coords) {
            console.warn(`No coords found for: ${currBody.englishName}`);
            continue;
        }
        if (currBody.englishName === '136199 Eris')
            currBody.englishName = 'Eris'
        else if (currBody.englishName === '136108 Haumea')
            currBody.englishName = 'Haumea'
        else if (currBody.englishName === '136472 Makemake')
            currBody.englishName = 'Makemake'

        const body = {
            id: currBody.id,
            name: currBody.englishName,
            meanRadiusKm: currBody.meanRadius,
            semimajorAxis: currBody.semimajorAxis,
            X: coords[1],
            Y: coords[2],
            Z: coords[3],
            parentId: null
        }
        planetDataList.push(body);
    }  
}

async function loadMoonData(horizonsLookup) {
    const LSSMoonLink = 'https://api.le-systeme-solaire.net/rest/bodies?filter[]=bodyType,eq,Moon';
    const LSSResponse = await fetch(LSSMoonLink,
        {
            headers: {
                'Authorization': `Bearer ${process.env.LSS_API_KEY}`
            }
        }
    );

    const LSSjson = await LSSResponse.json();
    for (const currBody of LSSjson.bodies){
        const planetCommand = horizonsLookup[currBody.englishName];
        if (!planetCommand) {
            console.warn(`No Horizons code found for: ${currBody.englishName}`);
            continue;
        }
        NASAparams.set('COMMAND', planetCommand);
        const NASAurl = `https://ssd.jpl.nasa.gov/api/horizons.api?${NASAparams}`;
        const NASAresponse = await fetch(NASAurl);
        const NASAjson = await NASAresponse.json();
        const coords = NASAjson.result.match(regexInput)
        if (!coords) {
            console.warn(`No coords found for: ${currBody.englishName}`);
            continue;
        }
        const body = {
            id: currBody.id,
            name: currBody.englishName,
            meanRadiusKm: currBody.meanRadius,
            semimajorAxis: currBody.semimajorAxis,
            X: coords[1],
            Y: coords[2],
            Z: coords[3],
            parentId: currBody.aroundPlanet?.planet
        }
        planetDataList.push(body);
    }  
}

async function loadCeres(horizonsLookup) {
    const ceresResponse = await fetch('https://api.le-systeme-solaire.net/rest/bodies/ceres', {
        headers: { 'Authorization': `Bearer ${process.env.LSS_API_KEY}` }
    });
    const ceresJson = await ceresResponse.json();

    const planetCommand = horizonsLookup[ceresJson.englishName] ?? '1';
    NASAparams.set('COMMAND', planetCommand);
    const NASAurl = `https://ssd.jpl.nasa.gov/api/horizons.api?${NASAparams}`;
    const NASAresponse = await fetch(NASAurl);
    const NASAjson = await NASAresponse.json();
    const coords = NASAjson.result.match(regexInput);
    if (!coords) {
        console.warn('No coords found for Ceres');
        return;
    }

    planetDataList.push({
        id: ceresJson.id,
        name: 'Ceres',
        meanRadiusKm: ceresJson.meanRadius,
        semimajorAxis: ceresJson.semimajorAxis,
        X: coords[1],
        Y: coords[2],
        Z: coords[3],
        parentId: null
    });
}

async function main() {
    const horizonsLookup = await buildHorizonsLookup();

    await loadSunData(horizonsLookup);
    await loadPlanetData(horizonsLookup);
    await loadDwarfPlanetData(horizonsLookup);
    await loadMoonData(horizonsLookup);
    await loadCeres(horizonsLookup);

    const completeJSON = JSON.stringify(planetDataList, null, 2);
    fs.writeFileSync(outputPath, completeJSON, 'utf-8');
}

main();
