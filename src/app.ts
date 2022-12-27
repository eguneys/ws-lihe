import { IncomingMessage, ClientRequest, createServer } from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import * as url from 'url'
import * as querystring from 'querystring'
import Fire from './fire'

import { User } from './model'

Fire.addUser(User.newUser())



export type VsId = `h${number}`

export abstract class Room {
  get nb_users() {
    return this.users.length
  }

  users: Array<LiClient> = []

  path!: string

  disconnect(client: LiClient) {
    this.users = this.users.filter(_ => _ !== client)

    Rooms.instance.publish_nb_users()
  }

  join(client: LiClient) {
    this.users.push(client)
    client._onJoinedRoom(this)
  }

  publish(t: string, d: any) {
    this.users.forEach(_ => _.send(t, d))
  }

}

export class LobbyRoom extends Room {
  static make = () => {
    let res = new LobbyRoom()
    res.path = '/lobby'
    return res
  }
}

export class VsRoom extends Room {
  static make = (id: VsId) => {
    let res = new VsRoom()
    res.path = `/vs/${id}`
    return res
  }
}

export class Rooms {

  static instance = new Rooms()

  get nb_users() {
    return this.lobby.nb_users +
      this.vs.map(_ => _.nb_users)
    .reduce((a, b) => a + b, 0)
  }

  connect(client: LiClient) {
    if (this.lobby.path === client.path) {
      this.lobby.join(client)
    } else if (client.path.match(/^\/vs\/h[a-zA-Z0-9]{8}$/)) {
      let vs = this.vs.find(_ => _.path === client.path)
      if (vs) {
        vs.join(client)
      }
    } else {
      client._onError(LiError.make(`bad path: ${client.path}`))
      return
    }

    this.publish_nb_users()
  }

  publish_nb_users() {
    this.publish('nb_users', this.nb_users)
  }

  publish(t: string, d: any) {
    this.lobby.publish(t, d)
    this.vs.forEach(_ => _.publish(t ,d))
  }

  lobby: LobbyRoom = LobbyRoom.make()
  vs: Array<VsRoom> = []
}

export class LiError {
  static make = (err: string) => new LiError(err)

  constructor(readonly err: string) {}
}

export type LiSend = (t: string, d: any) => void

export class LiClient {

  static make = (path: string) => {

    let res = new LiClient(path)

    return res

  }

  constructor(readonly path: string) {}

  send!: LiSend
  room!: Room

  _onJoinedRoom(room: Room) {
    this.room = room
  }

  _onConnected(send: LiSend, request: ClientRequest) {
    this.send = send
    Rooms.instance.connect(this)
  }

  _onMessage(data: any) {
    console.log(data)
  }

  _onError(e: any) {
    console.warn(e)
  }

  _onClose(code: number) {
    this.room?.disconnect(this)
  }
}

export function authenticate(request: IncomingMessage, cb: (err?: LiError, client?: LiClient) => void) {

  const parsedUrl = url.parse(request.url ?? '/')

  if (!parsedUrl || !parsedUrl.pathname) {
    cb(LiError.make('bad url'))
    return
  }

  const pathname = parsedUrl.pathname

  if (!request.headers.cookie) {
    
  }

  cb(undefined, LiClient.make(pathname))
}

export function app(port: number, env: string) {


  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })



  wss.on('connection', function connection(ws: WebSocket, request: ClientRequest, client: LiClient) {
    client._onConnected((t: string, d: any) => {
      ws.send(JSON.stringify({ t, d }))
    }, request)
    ws.on('close', (code: number, reason: string) => {
      client._onClose(code)
    })
    ws.on('error', (e: Error) => {
      client._onError(e)
    })
    ws.on('message', function message(data: any) {
      try {
        let _ = JSON.parse(data.toString())

        if (_.t === 'p') {
          ws.send('0')
          return
        }

        client._onMessage(_)
      } catch (e) {
        client._onError(e)
      }
    })
  })


  server.on('upgrade', function upgrade(request: IncomingMessage, socket, head) {
    authenticate(request, function next(err?: LiError, client?: LiClient) {
      if (err || !client) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      wss.handleUpgrade(request, socket, head, function done(ws) {
        wss.emit('connection', ws, request, client)
      })
    })
  })

  server.listen(port)
  console.log('listening on ', port)
}
