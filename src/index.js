// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

function strToJson(payload) {
  return JSON.parse(payload);
}

function jsonToStr(jsonString) {
  return JSON.stringify(jsonString);
}

function hex2str(hex) {
  return ethers.toUtf8String(hex);
}

function str2hex(str) {
  return ethers.hexlify(ethers.toUtf8Bytes(str));
}

let players = {}
let inventories = {}
let wallet = {}

function toUpperFromPayload(payload) {
  let strPayload = hex2str(payload)
  let jsonPayload = strToJson(strPayload)
  jsonPayload.message = jsonPayload.message.toUpperCase()
  let returnStr = jsonToStr(jsonPayload)
  let returnHex = str2hex(returnStr)
  return returnHex
}

function listMissions(sender) {
  if (!players[sender]) {
    return str2hex("Player not found")
  }
  return str2hex(jsonToStr({ missions: players[sender].missions }))
}

function acceptMission(args, missions) {
  const missionIndex = missions.findIndex(m => {
    return m == args.mission
  });
  if (missionIndex !== -1) {
    missions.splice(missionIndex, 1); 
    return str2hex(jsonToStr({ 
        missionSelected: args.mission
    }));
  }
}

async function createNotice(payload) {
  const advance_req = await fetch(rollup_server + "/notice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
  const json = await advance_req.json();

  console.log(
    `Received notice status ${advance_req.status} with body `, 
    JSON.stringify(json)
  );

  return json; 
}

async function createReport(decoded_payload) {
  let payload = str2hex(decoded_payload)// remember to encode the payload!
  const advance_req = await fetch(rollup_server + "/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
  console.log("Received report status " + advance_req.status);
}

function attackDragon(sender) {
  players[sender].dragonHP -= 20
  let dragonHP = players[sender].dragonHP
  if (dragonHP == 0) {
    return str2hex(`Your dragon is dead`);
  }
  return str2hex(jsonToStr({ health: dragonHP }))
}

function lootDragon(sender, inventories, dragonAssets) {
  if (!inventories[sender]) {
    inventories[sender] = []
  }
  let inventory = inventories[sender]

  let l = dragonAssets.length
  for (let i=0; i < l; i++) {
    let asset = dragonAssets.pop()
    console.log(asset)
    inventory.push(asset)
  }

  console.log("Inventory after looting: ", inventory);
  return {
    player: sender,
    inventory: inventory
  }
}

function sellAssets(sender, inventory, wallet) {
  if (!wallet[sender]) {
    wallet[sender] = { gold: 0 }
  }

  inventory[sender].forEach(item => {
    wallet[sender].gold += 50
  })

  // Clear the inventory after selling
  inventory[sender] = []
  
  console.log(`${sender} earned ${wallet[sender].gold} gold from selling assets.`)
  return {
    player: sender,
    wallet: wallet[sender]
  };
}

function makePlayer(sender) {
  if (!players[sender]) {
    players[sender] = {
      shout: false,
      dragonHP : 100,
      dragonAssets : [
        "Dragon Claw",
        "Dragon Scale",
        "Dragon Fang"
      ],
      missions : [
        "Kill the dragon",
        "Find a gnome",
        "Make omellete"
      ]
    }
  }
}

function parseDeposit(payload) {
  let senderSlice = ethers.dataSlice(payload, 0, 20).toLowerCase();
  let valueSlice = ethers.dataSlice(payload, 20, 52);

  let sender = ethers.getAddress(senderSlice)
  let value = BigInt(valueSlice)

  return {sender, value}
}

function deposit(payload, wallet) {
  console.log("pw", payload, wallet)
  let { sender, value } = parseDeposit(payload)
  console.log("sv", sender, value)
  if (!wallet[sender]) {
    wallet[sender] = { ether: BigInt(0) }
  }

  if (!wallet[sender].ether) {
    wallet[sender].ether = BigInt(0)
  }

  wallet[sender].ether += value

  return {
    player: sender,
    ether: wallet[sender].ether.toString()
  };

};

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));
  const payload = data["payload"];
  const metadata = data["metadata"];
  const sender = metadata["msg_sender"].toLowerCase();

  let responsePayload;
  if (data.metadata.msg_sender.toLowerCase() == "0xFfdbe43d4c855BF7e0f105c400A50857f53AB044".toLowerCase()) {
    let depositData = deposit(payload, wallet)
    createNotice(str2hex(jsonToStr(depositData)))
    return "accept"
  }

  makePlayer(sender)
  const req = strToJson(hex2str(payload));
  let route, args

  if (req.message && req.message === "I'm here, Cartesia!") {
    let json
    if (!players[sender].shout) {
      json = createNotice(payload)  
      players[sender].shout = true
    } else {
      let responsePayload = toUpperFromPayload(payload)
      json = createNotice(responsePayload)
    }

    return "accept";
  } else {
    route = req.route
    args = req.args
  }
  
  if (route === "accept_mission") {
    responsePayload = acceptMission(args, players[sender].missions);
    if (!responsePayload){
      await createReport("Mission not found");
      return "reject"
    }
  } else if (route === "attack_dragon") {
    responsePayload = attackDragon(sender);
    if (!responsePayload){
      await createReport("Dragon not found");
      return "reject"
    }
  } else if (route === "loot_dragon") {
    if (players[sender].dragonHP > 0) {
      await createReport("Your dragon is still alive!");
      return "reject"
    } 
    let lootObject = lootDragon(sender, inventories, players[sender].dragonAssets);
    responsePayload = str2hex(jsonToStr(lootObject))
  } else if (route === "sell_assets") {
    let salesObject = sellAssets(sender, inventories, wallet);
    responsePayload = str2hex(jsonToStr(salesObject));
  } else {
    await createReport("Invalid route");
    return "reject"
  }

  let json = await createNotice(responsePayload);
  return "accept";
}

async function handle_inspect(data) {
  console.log("Received inspect request data " + JSON.stringify(data));
  const payload = data["payload"];
  let endpoint = hex2str(payload);
  let words = endpoint.split('/')
  let responsePayload
  if (words[0] == "list_missions") {
    responsePayload = listMissions(words[1].toLowerCase())
  }
  
  const inspect_req = await fetch(rollup_server + "/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ payload: responsePayload }),
  });
  console.log("Received report status " + inspect_req.status);
  return "accept";
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();
      var handler = handlers[rollup_req["request_type"]];
      finish["status"] = await handler(rollup_req["data"]);
    }
  }
})();
