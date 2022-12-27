import { IncomingMessage, ClientRequest, createServer } from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import * as url from 'url'
import * as querystring from 'querystring'
import { username } from './username'


export class LiError {
  static make = (err: string) => new LiError(err)

  constructor(readonly err: string) {}
}

export type LiSend = (t: string, d: any) => void

export class LiClient {
  static make = (path: string) => new LiClient(path)

  constructor(readonly path: string) {}

  send!: LiSend

  _onConnected(send: LiSend, request: ClientRequest) {
    this.send = send
  }

  _onMessage(data: any) {
    console.log(data)
  }

  _onError(e: any) {
    console.log(e)
  }
}

export function authenticate(request: IncomingMessage, cb: (err?: LiError, client?: LiClient) => void) {

  const parsedUrl = url.parse(request.url ?? '/')

  if (!parsedUrl || !parsedUrl.pathname) {
    cb(LiError.make('bad url'))
    return
  }

  const pathname = parsedUrl.pathname

  //console.log(request.headers.cookie)

  cb(undefined, LiClient.make(pathname))
}

export function app(port: number, env: string) {


  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })



  wss.on('connection', function connection(ws: WebSocket, request: ClientRequest, client: LiClient) {
    client._onConnected((t: string, d: any) => {
      ws.send(JSON.stringify({ t, d }))
    }, request)
    ws.on('message', function message(data: any) {
      try {
        let _ = JSON.parse(data.toString())

        if (_.t === 'p') {
          ws.send('0')
          ws.send(JSON.stringify({t: 'nb_users', d: 30}))
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
