const xmlToJson = require('xml-to-json-stream');
const fetch = global.fetch || require('node-fetch'); // Node >=18 has global fetch

const fetchXmlToJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Upstream ${response.status}: ${response.statusText}`);
    const xmlText = await response.text();

    return new Promise((resolve, reject) => {
        const parser = xmlToJson({ attributeMode: false });
        parser.xmlToJson(xmlText, (err, json) => {
            if (err) return reject(err);
            resolve(json);
        });
    });
}


module.exports = fetchXmlToJson;
