import { AdvanceRoute, DefaultRoute, Router, WalletRoute } from "cartesi-router";
import {
  Wallet,
  Notice,
  Output,
  Error_out,
  Report,
  Voucher,
} from "cartesi-wallet";
import { encodeFunctionData, getAddress, hexToBytes, hexToString } from "viem";
import deployments from "./rollups.json";
import { v4 as uuidv4 } from "uuid";
import erc20abi from "./erc20abi.json";
import erc721abi from "./erc721abi.json";
const erc721_contract_address = getAddress(
  "0x68E3Ee84Bcb7543268D361Bb92D3bBB17e90b838"
);
const erc20_contract_address = getAddress(
  "0x68E3Ee84Bcb7543268D361Bb92D3bBB17e90b838"
);
let rollup_address = "";
const rollup_server: string = <string>process.env.ROLLUP_HTTP_SERVER_URL;

let Network: string = "localhost";
Network = <string>process.env.Network;
console.info("rollup server url is ", rollup_server, Network);
if (Network === undefined) {
  Network = "localhost";
}

let dappcontract = "0xa"; //address of the cartesi Dapp contract
const SWORD_PRICE = BigInt(100000000); //price of each sword on the game
const wallet = new Wallet(new Map());
const router = new Router(wallet);
const Missions = new Map();
Missions.set(0, "Kill the Dragon");
Missions.set(1, "Find a gnome");
Missions.set(2, "Make omlette");
/** HouseAssets holds all the native assets of this game centrally 
 
**/
let HouseAssets: {
  coins: number;
  assets: Array<string>;
  swords: Map<string, BigInt>;
} = {
  coins: 10000,
  assets: [],
  swords: new Map(),
};

/**
 * creating sample native assets for gameplay
 */
for (let i = 0; i < 20; i++) {
  HouseAssets.swords.set(uuidv4(), BigInt(10000000));
}

/**
 * Missing Dragon class defines each unique instance of Dragon that the user will be interacting with
 */
class MissionDragon {
  Id: string;
  private Health: number;
  scale: string;
  private assets: Array<string>;

  constructor() {
    this.Health = 100;
    this.Id = uuidv4();
    this.scale = uuidv4();
    this.assets = [uuidv4(), uuidv4(), uuidv4()];
  }

  getHealth = (): number => {
    return this.Health;
  };
  reduceHealth = () => {
    if (this.Health <= 10) {
      console.log("Your dragon is dead");
    } else {
      this.Health = this.Health - 10;
    }
  };
  getAssets = (): Array<string> => {
    return this.assets;
  };

  setAssets = (assets: Array<string>): void => {
    this.assets = assets;
  };
}

class Player {
  Id: string;
  private Level: number;
  private Missions: Map<number, string>
  private CatchPhrase: string;
  private assets: Array<string>;
  private Dragon: MissionDragon;
  private coins: number;
  private swords: Map<string, BigInt>;

  constructor(id: string) {
    this.Id = id;
    this.Level = 0;
    this.assets = [];
    this.CatchPhrase = "Not set";
    this.Dragon = new MissionDragon();
    this.coins = 100;
    this.swords = new Map();
    this.Missions = new Map();
    this.Missions.set(0, "Kill the Dragon");
    this.Missions.set(1, "Find a gnome");
    this.Missions.set(2, "Make omlette");
  }
  getAssets = (): Array<string> => {
    return this.assets;
  };

  addAsset = (asset: string) => {
    this.assets.push(asset);
  };

  removeAsset = () => {
    this.assets = this.assets.slice(1);
  };

  setAssets = (assets: Array<string>) => {
    this.assets = assets;
  };
  getCatchPhrase = (): string => {
    return this.CatchPhrase;
  };
  setCatchPhrase = (phrase: string) => {
    this.CatchPhrase = phrase;
  };

  getPlayerLevel = (): number => {
    return this.Level;
  };
  setPlayerLevel = (level: number) => {
    this.Level = level;
  };

  getDragon = (): MissionDragon => {
    return this.Dragon;
  };
  setDragon = (dragon: MissionDragon) => {
    this.Dragon = dragon;
  };

  getCoins = (): number => {
    return this.coins;
  };
  addCoins = (coins: number) => {
    this.coins = this.coins + coins;
  };

  getSwords = (): Map<string, BigInt> => {
    return this.swords;
  };

  addSword = (id: string, price: BigInt) => {
    this.swords.set(id, price);
  };

  listMissions = () => {
    return Object.fromEntries(this.Missions);
  }

  acceptMission = (task: number) => {
    if (!this.Missions.delete(task)) {
      throw "not in list"
    }
    this.setPlayerLevel(task);
  }

}

// Players is a Dynamic DA that holds unique player data coressponding to each user
let Players: Map<string, Player> = new Map();

class createNotice extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    return new Notice(this.request_args.data);
  }
}

class createReport extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    return new Report(this.request_args.data);
  }
}


class listMissions extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    return new Report(JSON.stringify(Missions));
  }
}

/**
 * Each method defines an action that the player can perform while interacting with the DApp
 */
class createUser extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);

    const user = new Player(this.msg_sender);
    Players.set(this.msg_sender, user);
    return new Notice(`New User created with Id:${user.Id}`);
  };
}

class setCatchPhrase extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(this.msg_sender);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    player?.setCatchPhrase(this.request_args.phrase.toUpperCase());
    Players.set(player.Id, player);
    return new Notice(this.request_args.phrase.toUpperCase());
  };
}



class signupforMission extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(this.msg_sender);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    return new Report(`Choose a mission ${player?.listMissions()}`);
  };
}

class acceptMission extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(this.msg_sender);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    try {
      player.acceptMission(this.request_args.mission);
    } catch (error) {
      return new Report("Mission not found");  
    }
    return new Notice(`{ 
      missionSelected: ${player?.getPlayerLevel()}
    }`);
  };
}

class fightDragon extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(this.msg_sender);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    const dragon = player?.getDragon();
    dragon.reduceHealth();
    if (dragon.getHealth() == 0) {
      return new Notice(`User : ${id} your dragon ${dragon.Id} is dead`);
    }
    player.setDragon(dragon);
    Players.set(player.Id, player);
    return new Report(
      JSON.stringify({ health: dragon.getHealth(), dragonId: dragon.Id })
    );
  };
}

class lootDragon extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(id);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    const dragon = player?.getDragon();
    const assets = dragon.getAssets();
    player.addAsset(String(assets[0]));
    dragon.setAssets(assets.slice(1) as Array<string>);
    player.setDragon(dragon);
    Players.set(id, player);
    return new Notice(
      JSON.stringify({ userid: id, assets: player.getAssets() })
    );
  };
}

class sellItems extends AdvanceRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(this.msg_sender);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    const assets = player.getAssets();
    if (assets.length == 0) {
      return new Error_out(
        `user : ${id} has no items in his bag to sell to the house`
      );
    }
    const asset = <string>assets[0];
    HouseAssets.assets.push(asset);
    HouseAssets.coins = HouseAssets.coins - 100;
    player.removeAsset();
    player.addCoins(100);
    Players.set(id, player);
    return new Notice(
      `user ${id} sold his asset ${asset} for 100 coins to the house`
    );
  };
}

class buySword extends WalletRoute {
  execute = (request: any) => {
    this.parse_request(request);
    const id = this.msg_sender;
    const player = Players.get(id);
    if (player == undefined) {
      return new Error_out(`User with id:${id} not found`);
    }
    let output: Output;
    try {
      output = wallet.ether_transfer(
        getAddress(this.msg_sender),
        getAddress(dappcontract),
        SWORD_PRICE
      );
    } catch (error) {
      return new Error_out(`unable to buy a sword ${error}`);
    }
    if (output.type === "error") {
      return new Error_out(output.payload);
    }
    const asset = HouseAssets.swords.entries().next().value;
    player.addSword(asset[0], asset[1]);
    HouseAssets.swords.delete(asset[0]);
    return new Notice(`sword with id : ${asset[0]} sold to user : ${id}`);
  };
}

class MintGold extends WalletRoute {
  execute = (request: any) => {
    this.parse_request(request);
    console.log("minting gold");
    try {
      wallet.erc20_transfer(
        getAddress(dappcontract),
        getAddress(this.msg_sender),
        getAddress(erc20_contract_address),
        BigInt(this.request_args.amount)
      );
      wallet.erc20_withdraw(
        getAddress(this.msg_sender),
        getAddress(erc20_contract_address),
        BigInt(this.request_args.amount)
      );
      return new Notice(
        `minting gold units: ${this.request_args.amount} to real world for user ${this.msg_sender} `
      );
    } catch (e) {
      return new Error_out(`error minting gold ${e}`);
    }
  };
}

class MintAssets extends WalletRoute {
  execute = (request: any) => {
    this.parse_request(request);
    console.log("minting erc721 token.....");
    const call = encodeFunctionData({
      abi: erc721abi,
      functionName: "mintTo",
      args: [this.msg_sender],
    });
    return new Voucher(erc721_contract_address, hexToBytes(call));
  };
}

class ListMissions extends DefaultRoute {
  public execute = (request: any) => {
    console.log("user is ", request);
    let player = Players.get(request.toLowerCase())
    let missions = player?.listMissions() 
    return new Report(
      JSON.stringify({
        missions
      })
    );
 
  };
}

var handlers: any = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

const send_request = async (output: Output | Set<Output>) => {
  if (output instanceof Output) {
    let endpoint;
    console.log("type of output", output.type);

    if (output.type == "notice") {
      endpoint = "/notice";
    } else if (output.type == "voucher") {
      endpoint = "/voucher";
    } else {
      endpoint = "/report";
    }

    console.log(`sending request ${typeof output}`);
    const response = await fetch(rollup_server + endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(output),
    });
    console.debug(
      `received ${output.payload} status ${response.status} body ${response.body}`
    );
  } else {
    output.forEach((value: Output) => {
      send_request(value);
    });
  }
};

router.addRoute("create_notice", new createNotice());
router.addRoute("create_report", new createReport());
// router.addRoute("list_missions", new listMissions());
router.addRoute("create_user", new createUser());
router.addRoute("set_catchphrase", new setCatchPhrase());
router.addRoute("signup_formission", new signupforMission());
router.addRoute("accept_mission", new acceptMission());
router.addRoute("fight_dragon", new fightDragon());
router.addRoute("loot_dragon", new lootDragon());
router.addRoute("sell_items", new sellItems());

router.addRoute("list_missions", new ListMissions());

router.addRoute("buy_sword", new buySword(wallet));
router.addRoute("mint_gold", new MintGold(wallet));
router.addRoute("mint_assets", new MintAssets(wallet));

async function handle_advance(data: any) {
  console.log("Received advance request data " + JSON.stringify(data));
  try {
    const payload = data.payload;
    const msg_sender: string = data.metadata.msg_sender;
    console.log("msg sender is", msg_sender.toLowerCase());
    const payloadStr = hexToString(payload);

    if (
      msg_sender.toLowerCase() ===
      deployments.contracts.EtherPortal.address.toLowerCase()
    ) {
      try {
        return router.process("ether_deposit", payload);
      } catch (e) {
        return new Error_out(`failed to process ether deposti ${payload} ${e}`);
      }
    }
    if (
      msg_sender.toLowerCase() ===
      deployments.contracts.DAppAddressRelay.address.toLowerCase()
    ) {
      rollup_address = payload;
      router.set_rollup_address(rollup_address, "ether_withdraw");
      router.set_rollup_address(rollup_address, "erc20_withdraw");
      router.set_rollup_address(rollup_address, "erc721_withdraw");
      dappcontract = rollup_address;
      Wallet.accounts.set(
        getAddress(rollup_address),
        wallet.balance_get(getAddress(rollup_address))
      );
      console.log("Setting DApp address");
      return new Notice(
        `DApp address set up successfully to ${rollup_address}`
      );
    }

    if (
      msg_sender.toLowerCase() ===
      deployments.contracts.ERC20Portal.address.toLowerCase()
    ) {
      try {
        return router.process("erc20_deposit", payload);
      } catch (e) {
        return new Error_out(`failed ot process ERC20Deposit ${payload} ${e}`);
      }
    }

    if (
      msg_sender.toLowerCase() ===
      deployments.contracts.ERC721Portal.address.toLowerCase()
    ) {
      try {
        return router.process("erc721_deposit", payload);
      } catch (e) {
        return new Error_out(`failed ot process ERC20Deposit ${payload} ${e}`);
      }
    }
    try {
      const jsonpayload = JSON.parse(payloadStr);
      console.log("payload is");
      return router.process(jsonpayload.method, data);
    } catch (e) {
      return new Error_out(`failed to process command ${payloadStr} ${e}`);
    }
  } catch (e) {
    console.error(e);
    return new Error_out(`failed to process advance_request ${e}`);
  }
}

async function handle_inspect(data: any) {
  console.debug(`received inspect request data${data}`);
  try {
    const url = hexToString(data.payload).split("/");
    console.log("url is ", url);
    return router.process(<string>url[0], url[1]);
  } catch (e) {
    const error_msg = `failed to process inspect request ${e}`;
    console.debug(error_msg);
    return new Error_out(error_msg);
  }
}

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

      var typeq = rollup_req.request_type;
      var handler: any;
      if (typeq === "inspect_state") {
        handler = handlers.inspect_state;
      } else {
        handler = handlers.advance_state;
      }
      var output = await handler(rollup_req.data);
      finish.status = "accept";
      if (output instanceof Error_out) {
        finish.status = "reject";
      }
      console.log(output);
      console.log(output instanceof Output);
      await send_request(output);
    }
  }
})();
