import Arweave from "arweave";
import fs, { read } from "fs";
import path from "path";
import { WarpFactory } from "warp-contracts";
import { DeployPlugin, ArweaveSigner } from "warp-contracts-plugin-deploy";

const ENV = "DEV";
let arweave = {};

if (ENV === "DEV") {
    arweave = Arweave.init({
        host: "localhost",
        port: 1984,
        protocol: "http",
    });
} else {
    arweave = Arweave.init({
        host: "arweave.net",
        port: 443,
        protocol: "https",
    });
}

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");
const userWallet = "bAJYgxGXt9KE4g8H7l7u80iFaBIgzpUQNUgycJby0lU";


function warpInit(env) {
    let warp = {};
    if (env === "DEV") {
        warp = WarpFactory.forLocal().use(new DeployPlugin());
    } else if (env === "TEST") {
        warp = WarpFactory.forTestnet().use(new DeployPlugin());
    } else if (env === "PROD") {
        warp = WarpFactory.forMainnet().use(new DeployPlugin());
    }
    return warp;
}

async function warpCreateNewContract(contractSource, initState, wallet) {
    let warp = {};
    let signer = {};
    if (ENV === "DEV") {
        warp = WarpFactory.forLocal().use(new DeployPlugin());
        signer = wallet;
    } else if (ENV === "TEST") {
        warp = WarpFactory.forTestnet().use(new DeployPlugin());
        signer = new ArweaveSigner(wallet);
    } else if (ENV === "PROD") {
        warp = WarpFactory.forMainnet().use(new DeployPlugin());
        signer = new ArweaveSigner(wallet);
    }

    const result = await warp.createContract.deploy({
        wallet: signer,
        initState: JSON.stringify(initState),
        src: contractSource,
    });
    return result.contractTxId;
}

async function runInteraction(contractId, input, wallet, warp) {
    const contract = warp.contract(contractId)
        .setEvaluationOptions({
            internalWrites: true
        })
        .connect(wallet);

    const txId = await contract.writeInteraction(input);
    console.log("*** INTERACTION txId: " + txId.originalTxId);
    return txId.originalTxId;
}
async function readContract(contractId) {
    console.log("**** READING CONTRACT:");
    let warp = {};
    if (ENV === "DEV") {
        warp = WarpFactory.forLocal().use(new DeployPlugin());
    } else if (ENV === "TEST") {
        warp = WarpFactory.forTestnet().use(new DeployPlugin());
    } else if (ENV === "PROD") {
        warp = WarpFactory.forMainnet().use(new DeployPlugin());
    }
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '/test-wallet.json')));

    const contract = warp.contract(contractId)
        .setEvaluationOptions({
            internalWrites: true
        })
        .connect(wallet);
    const result = await contract.readState();
    console.log(JSON.stringify(result));
    return result;
}

function createInitState(contractName) {
    const initState = {
        name: contractName,
        balances: { [userWallet]: 1000 },
        a: "",
        b: "",
        c: "",
        claims: [],
        claimable: [],
        tokens: []
    }
    return initState
}
async function setContractId(contractId, key, value, wallet, warp) {
    const input = {
        function: "set",
        key,
        value
    };
    const tx = await runInteraction(contractId, input, wallet, warp);
}

async function runSteps(wallet, warp, aId, bId, thirdId) {
    let tx = {};
    let input = {};

    // Run Step 1 - Allow on A contract
    input = {
        function: "allow",
        target: bId,
        qty: 1
    };
    tx = await runInteraction(aId, input, wallet, warp);


    // Run Step 2 - Claim A on B contract
    input = {
        function: "claimA",
        target: thirdId,
        txId: tx,
        qty: 1
    };
    tx = await runInteraction(bId, input, wallet, warp);

    // Run Step 3 - Claim B on C contract
    input = {
        function: "claimB",
        txID: tx,
        qty: 1
    };
    tx = await runInteraction(thirdId, input, wallet, warp);

    // Read all contracts
    console.log("*** CONTRACT A ***");
    await readContract(aId);
    console.log("*** CONTRACT B ***");
    await readContract(bId);
    console.log("*** CONTRACT 3rd ***");
    await readContract(thirdId);
}

async function runScript() {
    let wallet = JSON.parse(fs.readFileSync(path.join(__dirname, "/test-wallet.json")));
    const addr = await arweave.wallets.getAddress(wallet);

    if (ENV === "DEV") {
        await arweave.api.get(`mint/${addr}/10000000000000000`);
        await mine();
    }

    const aSrc = "/tests/contract-a.js";
    const bSrc = "/tests/contract-b.js";
    const cSrc = "/tests/contract-c.js";
    const dSrc = "/tests/contract-c.js";
    let initState = {};
    let tx = {};
    let input = {};
    let contractSource;

    // Create contracts
    initState = createInitState("A");
    contractSource = fs.readFileSync(path.join(__dirname, aSrc), "utf8");
    const aId = await warpCreateNewContract(contractSource, initState, wallet);
    initState = createInitState("B");
    contractSource = fs.readFileSync(path.join(__dirname, bSrc), "utf8");
    const bId = await warpCreateNewContract(contractSource, initState, wallet);
    initState = createInitState("C");
    contractSource = fs.readFileSync(path.join(__dirname, cSrc), "utf8");
    const cId = await warpCreateNewContract(contractSource, initState, wallet);
    initState = createInitState("D");
    contractSource = fs.readFileSync(path.join(__dirname, cSrc), "utf8");
    const dId = await warpCreateNewContract(contractSource, initState, wallet);
    
    const warp = warpInit(ENV);

    // Set Contract IDs in state
    tx = await setContractId(aId, "a", aId, wallet, warp);
    tx = await setContractId(aId, "b", bId, wallet, warp);
    tx = await setContractId(aId, "c", cId, wallet, warp);
    tx = await setContractId(aId, "d", dId, wallet, warp);

    tx = await setContractId(bId, "a", aId, wallet, warp);
    tx = await setContractId(bId, "b", bId, wallet, warp);
    tx = await setContractId(bId, "c", cId, wallet, warp);
    tx = await setContractId(bId, "d", dId, wallet, warp);  

    tx = await setContractId(cId, "a", aId, wallet, warp);
    tx = await setContractId(cId, "b", bId, wallet, warp);
    tx = await setContractId(cId, "c", cId, wallet, warp);
    tx = await setContractId(cId, "d", dId, wallet, warp);
    
    tx = await setContractId(dId, "a", aId, wallet, warp);
    tx = await setContractId(dId, "b", bId, wallet, warp);
    tx = await setContractId(dId, "c", cId, wallet, warp);
    tx = await setContractId(dId, "d", dId, wallet, warp);

    // Run once, everything works
    await runSteps(wallet, warp, aId, bId, cId);

    // Run again, failure
    await runSteps(wallet, warp, aId, bId, dId);


    console.log("*** PRINT CONTACT C ***");
    await readContract(cId);

    console.log("*** PRINT CONTACT D ***");
    await readContract(dId);
}

await runScript();