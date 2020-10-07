// After doing a wikidata query use the file query.json to build or rebuild the databae th1_akws
// 2020-10-07

const {MongoClient} = require('mongodb');
const fs = require('fs').promises;

// Consts
const PORT = process.env.SERVERPORT || 3005;											// Port for server

const debug = (process.env.DEBUG == "true");
const MONGOHOST = process.env.MONGOHOST || 'localhost';
const MONGOPORT = process.env.MONGOPORT || 27017;
const MONGOAUTH = (process.env.MONGOAUTH == "true");
const MONGOUSRP = process.env.MONGOUSRP || "";
const MONGOBASE = process.env.MONGOBASE || 'allsensors';

const MONGO_URL = MONGOAUTH ? 'mongodb://'+MONGOUSRP+'@' + MONGOHOST + ':' + MONGOPORT + '/?authSource=admin' :  'mongodb://'+MONGOHOST+':'+MONGOPORT;	// URL to mongo database

// Read whole file 'query.json' int memory
async function readQuery(name) {
    try {
        const query = await fs.readFile(name);
        return JSON.parse(query);
    } catch (e) {
        console.error(`File ${name} not found. ${e}`);
    }
}

// Find and return one entry from the database
// Params
//      name:       name of entry
//
//  Return
//      null if not found, else complete entry
async function findOneEntry(client, name) {
    const erg = await client.db("allsensors").collection("th1_akws")
        .findOne({name:name});
//    console.log(erg);
    return erg;
}


async function getAllEntries(client) {
    const cursor = client.db("allsensors").collection("th1_akws")
        .find({});
    const results = await cursor.toArray();
    console.log(`Anzahl der Einträge: ${results.length}`);
}


async function main(){
    const query = await readQuery('akws/query.json');

    const client = new MongoClient(MONGO_URL, {useNewUrlParser: true , useUnifiedTopology: true});
    try {
        await client.connect();
        for(let entry of query) {
            if (await findOneEntry(client, entry.name) == null) {
                const result = await client.db("allsensors").collection("th1_akws")
                    .insertOne(entry);
                console.log(`new entry ${entry.name} with result: ${result.insertedID}`);
            } else {
                process.stdout.write('.');
            }
        }
    } catch(e) {
        console.error(e);
    } finally {
        await client.close();
    }

}

main().catch(console.error());
