import { IncomingMessage, ClientRequest, createServer } from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import * as url from 'url'
import * as querystring from 'querystring'
import Fire from './fire'

import { User, UserId } from './model'
import { Vs, VsId } from './model'

export type Handlers = { [t: string]: (client: LiClient, d?: any) => void }

export abstract class Room {
  get nb_users() {
    return this.users.length
  }

  handlers!: Handlers
  users: Array<LiClient> = []

  path!: string

  disconnect(client: LiClient) {
    this.users = this.users.filter(_ => _ !== client)
    Rooms.instance.publish_nb_users()
    this._client_left(client)
  }

  join(client: LiClient) {
    this.users.push(client)
    client._onJoinedRoom(this)
    this._client_joined(client)
  }

  publish(t: string, d: any) {
    this.users.forEach(_ => _.send(t, d))
  }

  send_user(user: User, t: string, d?: any) {
    let client = this.users.find(_ => _.user === user)
    if (client) {
      client.send(t, d)
    }
  }

  _client_joined(client: LiClient) {}
  _client_left(client: LiClient) {}

}

export type Hook = {
  user: User
}

export type HookView = {
  by: UserId
}

export class LobbyRoom extends Room {
  static make = () => {
    let room = new LobbyRoom()
    room.path = '/lobby'
    room.handlers = {
      hadd(client: LiClient) {
        room.add_hook(client)
      },
      hrem(client: LiClient) {
        room.remove_hook(client)
      },
      hjoin(client: LiClient, _hook: HookView) {
        room.join_hook(client, _hook)
      }
    }
    return room
  }


  hooks: Array<Hook> = []

  map_hook(hook: Hook) {
    return {
      by: hook.user.username
    }
  }

  _client_joined(client: LiClient) {
    client.send('hlist', this.hooks.map(_ => this.map_hook(_)))
  }

  _client_left(client: LiClient) {
    this.remove_hook(client)
  }

  remove_hook(client: LiClient) {
    let i_hook = this.hooks.findIndex(_ => _.user === client.user)
    if (i_hook !== -1) {
      let hook = this.hooks[i_hook]
      this.hooks.splice(i_hook, 1)
      this.publish('hrem', hook.user.username)
    }
  }

  add_hook(client: LiClient) {
    let hook = { user: client.user }
    this.hooks = this.hooks.filter(_ => _.user !== client.user)
    this.hooks.push(hook)
    this.publish('hadd', this.map_hook(hook))
  }

  join_hook(client: LiClient, view: HookView) {
    let i_hook = this.hooks.findIndex(_ => _.user.username === view.by)
    if (i_hook !== -1) {
      let hook = this.hooks[i_hook]
      this.hooks.splice(i_hook, 1)
      this.publish('hrem', hook.user.username)

      this.pair(client.user, hook)
    }
  }


  pair(user: User, hook: Hook) {
    let vs = Vs.newVs()

    Fire.addVs(vs).then(vs => {
      this.send_user(user, 'redirect', { redirect: `/vs/${vs.id}` })
      this.send_user(hook.user, 'redirect', { redirect: `/vs/${vs.id}` })
    })
  }
}

export class VsRoom extends Room {
  static make = (vs: Vs) => {
    let room = new VsRoom()
    room.path = `/vs/${vs.id}`

    room.handlers = {
    }
    return room
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
      this.publish_nb_users()
    } else if (client.path.match(/^\/vs\/v[a-zA-Z0-9]{8}$/)) {
      let [_, id] = client.path.match(/^\/vs\/(v[a-zA-Z0-9]{8})$/)!
      let vs = this.vs.find(_ => _.path === client.path)
      if (vs) {
        vs.join(client)
        this.publish_nb_users()
      } else {
        Fire.getVs(id as VsId).then(vs => {
          if (vs) {
            let room = VsRoom.make(vs)
            this.vs.push(room)
            room.join(client)
            this.publish_nb_users()
          } else {
            client._onError(LiError.make(`bad vs id: ${id}`))
          }
        })
      }
    } else {
      client._onError(LiError.make(`bad path: ${client.path}`))
    }
  }

  publish_nb_users() {
    this.lobby.publish('nb_users', this.nb_users)
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

  static make = (user: User, path: string) => {

    let res = new LiClient(user, path)

    return res

  }

  constructor(readonly user: User, readonly path: string) {}

  send!: LiSend
  room!: Room

  _onJoinedRoom(room: Room) {
    this.room = room
    this.send('hello', this.user.username)
    
    if (this.user.newly_created) {
      this.send('cookie', this.user.id)
    }
  }

  _onConnected(send: LiSend, request: ClientRequest) {
    this.send = send
    Rooms.instance.connect(this)
  }

  _onMessage(data: any) {
    let { t, d } = data


    if (this.room.handlers[t]) {
      this.room.handlers[t](this, d)
    }

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

  let wait_user

  if (request.headers.cookie) {
    let lihe = request.headers.cookie.split(';').map(cookie => {
      const parts = cookie.split('=')
      let name = parts[0].trim()
      let value = parts[1].trim()

      return { name, value }
    }).find(_ => _.name === 'lihe')
    if (lihe) {
      let userId = lihe.value as UserId
      wait_user = Fire.getUser(userId)
    }
  }
  if (!wait_user) {
    wait_user = Fire.addUser(User.newUser())
  } else {
    wait_user = wait_user.then(_ => _ ?? Fire.addUser(User.newUser()))
  }

  wait_user.then(user => {
    let res = LiClient.make(user, pathname)
    cb(undefined, res)
  })
}

export function app(port: number, env: string) {

  Fire.env = env

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
