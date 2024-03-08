import './style.css'
import { PlaydateDevice, requestConnectPlaydate } from 'pd-usb';
let start_btn = document.getElementById("start")
if(!("serial" in navigator)) {
  if(start_btn) {
    start_btn.innerText = "WebSerial isn't supported on this device or navigator."
  }
} else if(start_btn){
  start_btn.addEventListener("click", () => {
    start()
  })
}

let PLAYDATE: null | PlaydateDevice = null;
let Configuration = {
  ip_address: "",
  version: "0.0.1 dev"
}

let TUNNEL: WebSocket | null = null;

async function start() {
  PLAYDATE = await requestConnectPlaydate();
  console.log(PLAYDATE)
  await PLAYDATE.serial.open()
  if(PLAYDATE.isOpen && !PLAYDATE.isBusy) {
    await PLAYDATE.serial.writeAscii('echo off\n')
    await PLAYDATE.serial.writeAscii('msg 0.SYS;gateway_init|hello world\n')
  } else {
    console.log("Connection succesful but couldn't send the init message... try again ?")
  }
  pollNewMessages()

}

async function pollNewMessages() {
  if(PLAYDATE == null) {return}
  let playdate_message = await PLAYDATE.serial.readLinesUntilTimeout()
  playdate_message.forEach(msg => {
    if(msg != "") {
      handlePacket(msg);

    }

  }) 
  requestAnimationFrame(() => {
    pollNewMessages()
  })
}

async function handlePacket(rawPacketString: string) {
  let packet = decodePacket(rawPacketString)
  console.log(packet)

  if(packet == null) {
    return;
  }
  else {
    if(packet.method == "GTW") {
      handleGTWPacket(packet)
    } else {
      if(TUNNEL != null) {
        console.log("forwarding packet... " + packet.toString())
        TUNNEL.send(packet.toString())
      }
    }
  }
}

async function handleGTWPacket(packet: Packet) {
  switch (packet.resource) {
    case "set_address":
      let userOK = confirm(`Allow the device to connect to ${packet.body} ?`)
      if(userOK) {
        Configuration.ip_address = packet.body
        OpenConnection()
      }
      break;
      
    default:
      console.warn("Unknown GTW command : " + packet.resource)
      break;
  }
}

async function OpenConnection() {
  try {
    TUNNEL = new WebSocket(`ws://${Configuration.ip_address}`)
    TUNNEL.onerror = (err) => {
      alert("The IP address asked by the Playdate was invalid or didn't have a YELLOWNET server.")
      console.error(err)
    }
    TUNNEL.onopen = () => {
      console.log("Websocket opened !")
    }

    TUNNEL.onmessage = (message) => {
      let packet = decodePacket(message.data)
      console.log(message)
      if(packet && packet.validate() && PLAYDATE && !PLAYDATE.isBusy) {
        PLAYDATE.serial.writeAscii(`msg ${packet.toString()}\n`)
      }
    }

  } catch (error) {
    alert("The IP address asked by the Playdate was invalid or didn't have a YELLOWNET server.")
  }
}

class Packet {
  id: string
  method: 'SYS' | 'GTW' | 'REQ' | 'ASW' | 'MSG'
  resource: string
  body: string
  constructor(id: string, method: string, resource: string, body: string) {
      this.id = id
      this.method = method as 'SYS' | 'GTW' | 'REQ' | 'ASW' | 'MSG'
      this.resource = resource
      this.body = body
  }
  toString() {
      return `${this.id}.${this.method};${this.resource}|${this.body}`
  }
  validate() {
    return this.id && this.method && this.resource && this.body
  }
}

function decodePacket(rawPacketString: string) {
  if(!rawPacketString.includes(".") || !rawPacketString.includes(";") || !rawPacketString.includes("|")) {
    return null;
  }

  let elements = { ID: "", TYPE: "", RESOURCE: "", BODY: "" };
  let e: "ID" | "TYPE" | "RESOURCE" | "BODY" = "ID";
  let escape = false;
  for (let i = 0; i < rawPacketString.length; i++) {
      let c = rawPacketString.charAt(i);
      if (escape) {
          escape = false;
          elements[e] += c;
          continue;
      }
      if (c === "\\") {
          escape = true;
          continue;
      }
      if (e === "ID" && c === ".") {
          e = "TYPE";
          continue;
      }
      if (e === "TYPE" && c === ";") {
          e = "RESOURCE";
          continue;
      }
      if (e === "RESOURCE" && c === "|") {
          e = "BODY";
          continue;
      }
      elements[e] += c;
  }
  return new Packet(elements.ID, elements.TYPE, elements.RESOURCE, elements.BODY);
}
